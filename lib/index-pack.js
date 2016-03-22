var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var cp = require('child_process')
var fs = require('fs')
var path = require('path')
var os = require('os')

module.exports = function (packFile, cb) {
  var name = Math.random().toString(36).substr(2)
  var indexFilename = path.join(os.tmpdir(), name + '.idx')
  var packFilename = path.join(os.tmpdir(), name + '.pack')

  var child = cp.spawn('git', ['index-pack', '--stdin',
    '-o', indexFilename, packFilename], {
    stdio: ['pipe', 'pipe', 'inherit']
  })
  pull(packFile, toPull.sink(child.stdin))
  child.on('close', function (err) {
    if (err) return cb(new Error('git index-pack returned ' + err))
    cb(null,
      toPull(fs.createReadStream(indexFilename), function (err) {
        fs.unlink(indexFilename, function (err) {
          if (err) return console.error(err)
        })
      }),
      // the output packfile here is the original packfile transformed to make
      // it not thin.
      toPull(fs.createReadStream(packFilename), function (err) {
        fs.unlink(packFilename, function (err) {
          if (err) return console.error(err)
        })
      })
    )
  })
}
