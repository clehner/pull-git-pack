function hexToStr(str) {
  var buf = new Buffer(str.length / 2)
  buf.hexWrite(str)
  return buf.toString('ascii')
}

var date = '1000000000 -0500'

var user = {
  name: 'test',
  email: 'test@localhost'
}
user.str = user.name + ' <' + user.email + '>'

var file = {
  data: new Buffer('i am a file'),
  hash: '68bd10497ea68e91fa85024d0a0b2fe54e212914'
}
var fileName = 'blah.txt'

var tree = {
  hash: '75c54aa020772a916853987a03bff7079463a861',
  data: new Buffer([0x31, 0x30, 0x30, 0x36, 0x34, 0x34, 0x20, 0x62, 0x6c, 0x61, 0x68, 0x2e, 0x74, 0x78, 0x74, 0x00, 0x68, 0xbd, 0x10, 0x49, 0x7e, 0xa6, 0x8e, 0x91, 0xfa, 0x85, 0x02, 0x4d, 0x0a, 0x0b, 0x2f, 0xe5, 0x4e, 0x21, 0x29, 0x14])
  // data: '100644 ' + fileName + '\0' + hexToStr(file.hash)
}

var commitMessage = 'Initial commit'
var commit = {
  hash: 'edb5b50e8019797925820007d318870f8c346726',
  data: new Buffer(['tree ' + tree.hash,
    'author ' + user.str + ' ' + date,
    'committer ' + user.str + ' ' + date,
    '', commitMessage, ''
  ].join('\n'))
}

exports.date = date
exports.user = user
exports.file = file
exports.fileName = fileName
exports.tree = tree
exports.commitMessage = commitMessage
exports.commit = commit

