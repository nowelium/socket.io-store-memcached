# socket.io-store-memcached

  Socket.io memcached store

## Installation

  via npm:

    $ npm install socket.io-store-memcached

## Example

    var io = require('socket.io').listen(8080);
    var MemcachedStore = require('../index');
    io.set('store', new MemcachedStore({
      hosts: 'localhost:11211'
    }));

## Options

  - `hosts` Memcached servers locations, can by string, array, hash.

  For details see [node-memcached](http://github.com/3rd-Eden/node-memcached).

## License 

(The MIT License)

Copyright (c) 2012 Yusuke Hata

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
