var crypto = require('crypto')
var pull = require('pull-stream')

exports.createHash = function (type) {
  var hash = crypto.createHash(type)
  var hasher = pull.through(hash.update.bind(hash))
  var digest
  hasher.hash = hash
  hasher.digest = hash.digest.bind(hash)
  hasher.readDigest = function (abort, cb) {
    if (digest) cb(true)
    else cb(null, digest = hash.digest())
  }
  return hasher
}

exports.createGitObjectHash = function (objectType, objectLength) {
  var hasher = exports.createHash('sha1')
  hasher.hash.update(objectType + ' ' + objectLength + '\0')
  return hasher
}
