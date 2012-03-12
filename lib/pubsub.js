var util = require('util')
  , events = require('events')
  , MemcachedQueue = require('./queue')
  , MemcachedSet = require('./set')
  ;

exports = module.exports = MemcachedPubsub;

function MemcachedPubsub (client, nodeId, opts){
  opts = opts || {};

  this.client = client;
  this.nodeId = nodeId;
  this.options = opts;

  this.PUBSUB_MSG_TMPL = util.format('pubsub/%s/sub/%s/msg/%s', opts.memcachedStorePubSubId);
  this.PUBSUB_SUB_KEY = util.format('pubsub/%s/sub', opts.memcachedStorePubSubId);

  this.subscribeSet = new MemcachedSet(client, this.PUBSUB_SUB_KEY, opts);
  this.pack = JSON.stringify;
  this.unpack = JSON.parse;

  this.setMaxListeners(0);

  this.listIndex = [];
  this.subscribeList = [];
};
MemcachedPubsub.prototype = new events.EventEmitter();
MemcachedPubsub.prototype.end = function(cb){
  var self = this;
  self.emit('end');

  var removeSubscribe = function(next){
    if(self.listIndex.length < 1){
      return next(null);
    }

    var listIndex = self.listIndex.shift();
    return self.subscribeSet.del(listIndex, function(err){
      if(err){
        return next(err);
      }
      return removeSubscribe(next);
    });
  };
  return removeSubscribe(function(err){
    if(err){
      return cb(err);
    }
    return self.subscribeSet.end(function (){
      return cb(null);
    });
  });
};
MemcachedPubsub.prototype.publish = function(key, args){
  var nodeId = this.nodeId;
  var client = this.client;
  var self = this;

  var expires = this.options.memcachedStoreExpires;
  var PUBSUB_MSG_TMPL = this.PUBSUB_MSG_TMPL;

  var unique = function(list){
    var tmp = [];
    return list.filter(function(value){
      if(tmp.indexOf(value) < 0){
        tmp.push(value);
        return true;
      }
      return false;
    });
  };

  var message = self.pack({
    nodeId: nodeId,
    name: key,
    args: args
  });
  return self.subscribeSet.getAll(function(err, subscribers){
    if(err){
      return ;
    }

    return unique(subscribers).filter(function(subscriberId){
      if(nodeId == subscriberId){
        return false;
      }
      return true;
    }).forEach(function(subscriberId){
      var queue = new MemcachedQueue(client, util.format(PUBSUB_MSG_TMPL, subscriberId, key));
      return queue.enqueue(message, expires, function(err){
        // nop
      });
    });
  });
};
MemcachedPubsub.prototype.subscribe = function(key, consumer, cb){
  var nodeId = this.nodeId;
  var client = this.client;
  var self = this;

  var expires = this.options.memcachedStoreExpires;
  var memcachedStorePubSubInterval = this.options.memcachedStorePubSubInterval;
  var PUBSUB_MSG_TMPL = this.PUBSUB_MSG_TMPL;

  if(0 < this.subscribeList.indexOf(key)){
    return cb(null);
  }

  var register = function(next){
    return self.subscribeSet.add(nodeId, expires, function(errAdd, exists, listIndex){
      if(errAdd){
        return next(errAdd);
      }
      if(exists){
        return next(null);
      }
      self.listIndex.push(listIndex);
      return next(null);
    });
  };

  return register(function(err){
    if(err){
      return cb(err);
    }
    cb(null);

    self.subscribeList.push(key);

    var timerId = -1;
    var messageReadable = true;
    var readMessage = function (){
      if(!messageReadable){
        return;
      }

      if(-1 !== timerId){
        clearTimeout(timerId);
        timerId = -1;
      }

      var queue = new MemcachedQueue(client, util.format(PUBSUB_MSG_TMPL, nodeId, key));
      return queue.dequeue(expires, function(err, value){
        if(err){
          return timerId = setTimeout(readMessage, memcachedStorePubSubInterval);
        }
        if(null != value){
          var message = self.unpack(value);
          var args = message.args;
          consumer.apply(null, args);
        }
        return timerId = setTimeout(readMessage, memcachedStorePubSubInterval);
      });
    };

    var unsubscribe = function(){
      messageReadable = false;
      self.removeListener('unsubscribe' + key, unsubscribe);
    };
    self.on('unsubscribe' + key, unsubscribe);
    self.on('end', function (){
      self.emit('unsubscribe' + key);
    });
    return readMessage();
  });
};
MemcachedPubsub.prototype.unsubscribe = function(key, cb){
  this.emit('unsubscribe' + key);
  return cb(null);
};
