var tape = require('tape')
var indexPack = require('../lib/index-pack')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var cp = require('child_process')

tape('index-pack produces output', function (t) {
  var child = cp.spawn('git', ['pack-objects', '--stdout', '--revs'])
  child.stdin.end('HEAD\n')
  indexPack(toPull.source(child.stdout), function (err, idx) {
    t.error(err, 'index pack')
    pull(idx, pull.reduce(function (val, buf) {
      return val + buf.length
    }, 0, function (err, length) {
      t.error(err, 'read index pack')
      t.comment('len: ' + length)
      t.ok(length > 0, 'length')
      t.end()
    }))
  })
})
