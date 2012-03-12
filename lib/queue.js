var util = require('util');

exports = module.exports = MemcachedQueue;

function MemcachedQueue(client, id){
  this.client = client;
  this.id = id;

  this.HEAD_KEY = util.format('queue/%s.head', id);
  this.TAIL_KEY = util.format('queue/%s.tail', id);
  this.MSG_KEY_TMPL = util.format('queue/%s#%d', id);
};
MemcachedQueue.prototype.end = function (cb){
  // nop
  return cb();
};
MemcachedQueue.prototype.enqueue = function(value, expires, cb){
  var client = this.client;
  var headKey = this.HEAD_KEY;
  var tailKey = this.TAIL_KEY;
  var MSG_KEY_TMPL = this.MSG_KEY_TMPL;

  var incrementTail = function(next){
    return client.gets(tailKey, function(err, gets){
      if(err){
        return next(err);
      }
      if(false === gets){
        return client.set(tailKey, '0', expires, function(err, setTail){
          if(err){
            return next(err);
          }
          return client.set(headKey, '0', expires, function(err, setHead){
            return next(null, 0);
          });
        });
      }

      var casValue = gets.cas;
      var nextId = 1 + Number(gets[tailKey]);
      return client.cas(tailKey, nextId, casValue, expires, function(err, cas){
        if(err){
          return next(err);
        }
        if(false === cas){
          return incrementTail(next);
        }
        return next(null, nextId);
      });
    });
  };
  return incrementTail(function(err, nextId){
    if(err){
      return cb(err);
    }

    var msgKey = util.format(MSG_KEY_TMPL, nextId);
    return client.set(msgKey, value, expires, cb);
  });
};
MemcachedQueue.prototype.dequeue = function(expires, cb){
  var client = this.client;
  var headKey = this.HEAD_KEY;
  var tailKey = this.TAIL_KEY;
  var MSG_KEY_TMPL = this.MSG_KEY_TMPL;

  var incrementHead = function(next){
    return client.gets(tailKey, function(errTail, getsTail){
      if(errTail){
        return next(errTail);
      }
      if(false === getsTail){
        return next(null, -1);
      }

      var tailIndex = Number(getsTail[tailKey]);

      return client.gets(headKey, function(errHead, getsHead){
        if(errHead){
          return next(errHead);
        }
        if(false === getsHead){
          return next(null, -1);
        }

        var headIndex = Number(getsHead[headKey]);

        if(tailIndex < headIndex){
          return next(null, -1);
        }

        var casValue = getsHead.cas;
        var nextId = 1 + headIndex;
        return client.cas(headKey, nextId, casValue, expires, function(err, cas){
          if(err){
            return next(err);
          }
          if(false === cas){
            return incrementHead(next);
          }
          return next(null, headIndex);
        });
      });
    });
  };
  return incrementHead(function(err, index){
    if(err){
      return cb(err);
    }
    if(index < 0){
      return cb(null, null);
    }

    var msgKey = util.format(MSG_KEY_TMPL, index);
    return client.get(msgKey, function(err, get){
      if(err){
        return cb(err);
      }
      if(false === get){
        return cb(null, null);
      }
      return client.del(msgKey, function(err, del){
        if(err){
          // nop
        }
        return cb(null, get);
      });
    });
  });
};
