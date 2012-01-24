var io = require('socket.io').listen(8080);
var MemcachedStore = require('../index');
io.set('store', new MemcachedStore({
  hosts: '127.0.0.1:11211'
}));

io.sockets.on('connection', function(client){
  console.log('connect: ' + client.id);
  client.broadcast.send('user connected');

  client.on('message', function (message){
    console.log('client message: ' + message);
    client.send('rely:' + message);
    client.broadcast.send(client.id + ' says: ' + message);
  });

  client.on('disconnect', function(){
    console.log('disconnect: ' + client.id);
  });
});
