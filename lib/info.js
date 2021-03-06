var through = require('through2')
var defined = require('defined')
var bencode = require('bencode')
var createHash = require('sha.js')
var concat = require('concat-stream')
var sizeStream = require('fixed-size-stream-splitter')

module.exports = function (opts) {
  if (!opts) opts = {}
  if (typeof opts === 'number') opts = { size: opts }
  var pieces = defined(opts.pieces, [])
  var hexpieces = pieces.map(function (p) { return p.toString('hex') })
  var pieceLength = defined(opts.size, 1024 * 64)
  var streamIndex = 0
  var offset = defined(opts.offset, 0)
  var streams = []
  var rem = opts.remainder

  var sopts = { size: pieceLength, offset: offset }
  var outer = sizeStream(sopts, function (stream) {
    streams.push([ stream, streamIndex++ ])
    if (streams.length === 1) nextStream()
  })
  function nextStream () {
    if (streams.length === 0) return
    var tstream = streams.shift()
    var stream = tstream[0]
    var start = tstream[1] * pieceLength + offset
    var size = (tstream[1] + 1) * pieceLength + offset - offset % pieceLength
    offset -= offset % pieceLength
    var pending = 2
    var h = createHash('sha1')

    if (rem) {
      h.update(rem)
      rem = null
    }
    stream.pipe(through(write, done))
    outer.emit('stream', stream, start, done)
 
    function write (buf, enc, next) {
      h.update(buf)
      next()
    }
 
    function done () {
      if (--pending !== 0) return
      var hash = h.digest()
      pieces.push(hash)
      hexpieces.push(hash.toString('hex'))
 
      var info = {
        name: defined(opts.name, 'output'),
        length: size,
        'piece length': pieceLength,
        pieces: Buffer.concat(pieces)
      }
      var infoBuffer = bencode.encode(info)
      var infoHash = createHash('sha1').update(infoBuffer).digest('hex')
      var torrent = {
        info: info,
        infoHash: infoHash,
        infoBuffer: infoBuffer,
        files: [
          {
            offset: 0,
            length: size,
            path: '/fake/' + infoHash
          }
        ],
        pieces: hexpieces.slice(),
        pieceLength: pieceLength,
        announce: defined(opts.announce, opts.trackers, [])
      }
      outer.emit('torrent', torrent, nextStream)
    }
  }
  return outer
}

function noop () {}
