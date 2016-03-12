# pull-git-pack

Encode and decode git packfiles, with a [pull-stream][] API

## API

```js
var pack = require('pull-git-pack')
```

#### `pack.decode(opts, repo[, onEnd, read]): readObject`

Transform packfile data into git objects.
If `read` is not given, `pack.decode` returns a through stream.

- `opts.verbosity < 2`: number, determines level of console output.
  - `verbosity < 2`: number, determines level of console output.
  - `verbosity == 2`: number, determines level of console output.
  - `verbosity > 2`: number, determines level of console output.

- `opts.onHeader(numObjects)`: function called once when reading the header at
    the beginning of the packfile that lists how many objects the packfile
    contains.

- `repo`: an [abstract-pull-git-repo][] object. `repo.getObject` may be called
  to resolve ref-deltas in the packfile (including if the target
  object is in the packfile itself)

- `onEnd(err)`: function called when the packfile is finished decoding or has
  an error

- `read`: readable stream of packfile data

- `readObject`: readable stream of git objects in the format of [abstract-pull-git-repo][]
  - `object.type`: one of `["tag", "commit", "tree", "blob"]`
  - `object.length`: size in bytes of the object
  - `object.offset`: offset of the object in the pack. for use with packidxs
  - `object.read(abort, next(end, buf))`: readable stream of data

#### `pack.encode([opts, ]numObjects, readObject): read`

Transform git objects into packfile data.
If `readObject` is not given, `pack.encode` returns a through stream.

- `opts`: options, reserved for later use

- `numObjects`: number of git objects that will be in the packfile

- `readObject(end, cb(end, object)}`: readable stream of git objects

- `read(end, cb(end, data))`: readable stream of packfile data

[abstract-pull-git-repo]: https://github.com/clehner/abstract-pull-git-repo
[pull-stream]: https://github.com/dominictarr/pull-stream/

## License

Copyright (c) 2016 Charles Lehner

Usage of the works is permitted provided that this instrument is
retained with the works, so that any entity that uses the works is
notified of this instrument.

DISCLAIMER: THE WORKS ARE WITHOUT WARRANTY.
