var buffered = require('pull-buffered')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var pako = require('pako')
var createHash = require('./lib/util').createHash
var cat = require('pull-cat')

exports.decode = decodePack
exports.encode = encodePack

var PACK_VERSION = 2

var objectTypes = [
  'none', 'commit', 'tree', 'blob',
  'tag', 'unused', 'ofs-delta', 'ref-delta'
]
var objectTypeNums = {
  commit: 1,
  tree: 2,
  blob: 3,
  tag: 4,
  'ofs-delta': 6,
  'ref-delta': 7
}

function error(cb) {
  return function (err) {
    cb(err || true)
  }
}

function inflateBytes(read) {
  var inflate = new pako.Inflate()
  var ended, dataOut

  inflate.onData = function (data) {
    dataOut = new Buffer(data)
  }

  inflate.onEnd = function (status) {
    ended = (status === 0) ? true : new Error(inflate.strm.msg)
  }

  return function (abort, cb) {
    if (ended) return cb(ended)
    read(abort, function next(end, data) {
      if (end === true) {
        end = null
        data = []
      }
      if (ended = end) return cb(end)
      if (data.length > 1) return cb(new Error('got more than one byte'))
      dataOut = null
      inflate.push(data, end === true)
      if (dataOut)
        cb(null, dataOut)
      else if (ended)
        cb(ended)
      else
        // let the stack unwind
        setImmediate(function () {
          read(null, next)
        })
    })
  }
}

function deflate(read) {
  var def = new pako.Deflate()
  var queue = []
  var ended

  def.onData = function (data) {
    queue.push([null, new Buffer(data)])
  }

  def.onEnd = function (status) {
    queue.push([(status === 0) ? true : new Error(def.strm.msg)])
  }

  return function readOut(abort, cb) {
    if (ended)
      cb(ended)
    else if (queue.length)
      cb.apply(this, queue.shift())
    else
      read(abort, function next(end, data) {
        if (end === true) def.push([], true)
        else if (end) return cb(end)
        else def.push(data)
        readOut(null, cb)
      })
  }
}

function decodePack(opts, repo, onEnd, read) {
  if (read === undefined)
    return decodePack.bind(this, opts, repo, onEnd)
  onEnd = onEnd || function(err) {
    if (err) throw err
  }
  opts = opts || {}

  var ended
  var inObject = false
  var numObjects = -1
  var checksum = createHash('sha1')
  var b = buffered(read)
  var readByte = checksum(b.chunks(1))
  var readWord = checksum(b.chunks(4))
  var readHash = checksum(b.chunks(20))
  var readChecksum = b.chunks(20)
  var expectChecksum = true
  var _cb

  function readHeader(cb) {
    readWord(null, function (end, header) {
      if (ended = end) return cb(end)
      if (!header.equals(header, new Buffer('PACK')))
        read(new Error('Invalid packfile header'), error(cb))
      else
        readVersion(cb)
    })
  }

  function readVersion(cb) {
    readWord(null, function (end, word) {
      if (ended = end) return cb(end)
      var version = word.readUInt32BE()
      if (version < 2 || version > 3)
        read(new Error('Invalid packfile version ' + version), error(cb))
      else
        readNumObjects(cb)
    })
  }

  function readNumObjects(cb) {
    readWord(null, function (end, word) {
      if (ended = end) return cb(end)
      numObjects = word.readUInt32BE()
      if (opts.verbosity >= 2)
        console.error(numObjects + ' objects')
      if (opts.onHeader)
        opts.onHeader(numObjects)
      readObject(null, cb)
    })
  }

  function readTypedVarInt(cb) {
    var type, value, shift
    readByte(null, function (end, buf) {
      if (ended = end) return cb(end)
      var firstByte = buf[0]
      type = objectTypes[(firstByte >> 4) & 7]
      value = firstByte & 15
      shift = 4
      checkByte(firstByte)
    })

    function checkByte(byte) {
      if (byte & 0x80)
        readByte(null, gotByte)
      else
        cb(null, type, value)
    }

    function gotByte(end, buf) {
      if (ended = end) return cb(end)
      var byte = buf[0]
      value += (byte & 0x7f) << shift
      shift += 7
      checkByte(byte)
    }
  }

  function getObject(cb) {
    inObject = true
    readTypedVarInt(function (end, type, length) {
      if (opts.verbosity >= 2)
        console.error('read object header', end, type, length)
      numObjects--
      if (end === true && expectChecksum)
        onEnd(new Error('Missing checksum'))
      if (ended = end) return cb(end)
      // TODO: verify that the inflated data is the correct length
      if (type == 'ref-delta')
        getObjectFromRefDelta(length, gotObject)
      else
        gotObject(null, {
          type: type,
          length: length,
          read: inflateBytes(readByte)
        })
    })

    function gotObject(err, obj) {
      // pass through the object but detect when it ends
      if (err) return cb(err)
      cb(null, {
        type: obj.type,
        length: obj.length,
        read: pull(
          obj.read,
          pull.through(null, function () {
            inObject = false
            if (_cb) {
              var cb = _cb
              readObject(null, cb)
            }
          })
        )
      })
    }
  }

  function getRepoObject(repo, id, cb) {
    // TODO: abstract this better
    ;(repo.getObjectFromAny || repo.getObject).call(repo, id, cb)
  }


  // TODO: test with ref-delta objects in pack
  function getObjectFromRefDelta(length, cb) {
    readHash(null, function (end, sourceHash) {
      if (end) return cb(end)
      sourceHash = sourceHash.toString('hex')
      var b = buffered(inflateBytes(readByte))
      var readInflatedByte = b.chunks(1)
      readVarInt(readInflatedByte, function (err, expectedSourceLength) {
        if (err) return cb(err)
        readVarInt(readInflatedByte, function (err, expectedTargetLength) {
          if (err) return cb(err)
          if (opts.verbosity >= 3)
            console.error('getting object', sourceHash)
          setTimeout(function () {
            getRepoObject(repo, sourceHash, function (err, sourceObject) {
              if (opts.verbosity >= 3)
                console.error('got object', sourceHash, sourceObject, err)
              if (err) return cb(err)
              if (sourceObject.length != expectedSourceLength)
                cb(new Error('Incorrect source object size in ref delta'))
              else
                patchObject(opts, b, length, sourceObject,
                  expectedTargetLength, cb)
            })
          }, 50)
        })
      })
    })
  }

  function readTrailer(cb) {
    // read the checksum before it updates to include the trailer
    var expected = checksum.digest()
    readChecksum(null, function (end, value) {
      cb(true)
      if (end === true && expectChecksum)
        onEnd(new Error('Missing checksum'))
      if (!value.equals(expected)) {
        onEnd(new Error('Checksum mismatch: ' +
          expected.hexSlice() + ' != ' + value.hexSlice()))
      } else {
        if (opts.verbosity >= 3)
          console.error('checksum ok', expected.hexSlice())
        onEnd(null)
      }
    })
  }

  function readObject(abort, cb) {
    if (ended) cb(ended)
    else if (inObject) _cb = cb
    else if (abort) read(abort, function (err) { cb(ended = err || abort) })
    else if (numObjects < 0) readHeader(cb)
    else if (numObjects > 0) getObject(cb)
    else if (expectChecksum) readTrailer(cb)
  }

  return readObject
}

function readVarInt(readByte, cb) {
  var value = 0, shift = 0
  readByte(null, function gotByte(end, buf) {
    if (ended = end) return cb(end)
    var byte = buf[0]
    value += (byte & 0x7f) << shift
    shift += 7
    if (byte & 0x80)
      readByte(null, gotByte)
    else
      cb(null, value)
  })
}

function patchObject(opts, deltaB, deltaLength, srcObject, targetLength, cb) {
  var readByte = deltaB.chunks(1)
  var srcBuf
  var ended

  if (opts.verbosity >= 2)
    console.error('patching', srcObject.type, targetLength)
  pull(
    srcObject.read,
    pull.collect(function (err, bufs) {
      srcBuf = Buffer.concat(bufs, srcObject.length)
      cb(null, {
        type: srcObject.type,
        length: targetLength,
        read: read
      })
    })
  )

  function read(abort, cb) {
    if (ended) return cb(ended)
    readByte(null, function (end, dBuf) {
      if (ended = end) return cb(end)
      var cmd = dBuf[0]
      if (cmd & 0x80)
        // skip a variable amount and then pass through a variable amount
        readOffsetSize(cmd, deltaB, function (err, offset, size) {
          if (err) return earlyEnd(err)
          var buf = srcBuf.slice(offset, offset + size)
          cb(end, buf)
        })
      else if (cmd)
        // insert `cmd` bytes from delta
        deltaB.chunks(cmd)(null, cb)
      else
        cb(new Error("unexpected delta opcode 0"))
    })

    function earlyEnd(err) {
      cb(err === true ? new Error('stream ended early') : err)
    }
  }
}

function readOffsetSize(cmd, b, readCb) {
  var readByte = b.chunks(1)
  var offset = 0, size = 0

  function addByte(bit, outPos, cb) {
    if (cmd & (1 << bit))
      readByte(null, function (err, buf) {
        if (err) readCb(err)
        else cb(buf[0] << (outPos << 3))
      })
    else
      cb(0)
  }

  addByte(0, 0, function (val) {
    offset = val
    addByte(1, 1, function (val) {
      offset |= val
      addByte(2, 2, function (val) {
        offset |= val
        addByte(3, 3, function (val) {
          offset |= val
          addSize()
        })
      })
    })
  })
  function addSize() {
    addByte(4, 0, function (val) {
      size = val
      addByte(5, 1, function (val) {
        size |= val
        addByte(6, 2, function (val) {
          size |= val
          readCb(null, offset, size || 0x10000)
        })
      })
    })
  }
}

function encodeTypedVarInt(typeStr, length, cb) {
  var type = objectTypeNums[typeStr]
  if (!type)
    return cb(new Error("Bad object type " + typeStr))

  var vals = []
  var b = (type << 4) | (length & 15)
  for (length >>= 4; length; length >>= 7) {
    vals.push(b | 0x80)
    b = length & 0x7f
  }
  vals.push(b)
  cb(null, new Buffer(vals))
}

function encodePack(opts, numObjects, readObject) {
  if (numObjects === undefined)
    numObjects = opts, opts = null
  if (readObject === undefined)
    return encodePack.bind(this, opts, numObjects)

  var header = new Buffer(12)
  header.write('PACK')
  header.writeUInt32BE(PACK_VERSION, 4)
  header.writeUInt32BE(numObjects, 8)
  var checksum = createHash('sha1')
  var readData

  return cat([
    checksum(cat([
      pull.once(header),
      encodeObject
    ])),
    checksum.readDigest
  ])

  function encodeObject(abort, cb) {
    if (readData)
      readData(abort, function (end, data) {
        if (end === true)
          readObject(abort, nextObject)
        else
          cb(end, data)
      })
    else
      readObject(abort, nextObject)

    function nextObject(end, object) {
      if (end) return cb(end)
      readData = deflate(object.read)
      encodeTypedVarInt(object.type, object.length, cb)
    }
  }
}

