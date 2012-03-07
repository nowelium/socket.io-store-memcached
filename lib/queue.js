var util = require('util');

exports = module.exports = MemcachedQueue;

const HEAD_KEY_TMPL = 'queue/%s.head';
const TAIL_KEY_TMPL = 'queue/%s.tail';
const MSG_KEY_TMPL = 'queue/%s#%d';

function MemcachedQueue(client, id){
  this.client = client;
  this.id = id;
};
MemcachedQueue.prototype.end = function (cb){
  // nop
  return cb();
};
MemcachedQueue.prototype.enqueue = function(value, expires, cb){
  var id = this.id;
  var client = this.client;
  var headKey = util.format(HEAD_KEY_TMPL, id);
  var tailKey = util.format(TAIL_KEY_TMPL, id);

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

    var msgKey = util.format(MSG_KEY_TMPL, id, nextId);
    return client.set(msgKey, value, expires, cb);
  });
};
MemcachedQueue.prototype.dequeue = function(expires, cb){
  var id = this.id;
  var client = this.client;
  var headKey = util.format(HEAD_KEY_TMPL, id);
  var tailKey = util.format(TAIL_KEY_TMPL, id);

  return client.gets(tailKey, function(errTail, getsTail){
    if(errTail){
      return cb(errTail);
    }
    if(false === getsTail){
      return cb(null, null);
    }

    var tailIndex = Number(getsTail[tailKey]);

    var incrementHead = function(next){
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
    };
    return incrementHead(function(err, index){
      if(err){
        return cb(err);
      }
      if(index < 0){
        return cb(null, null);
      }

      var msgKey = util.format(MSG_KEY_TMPL, id, index);
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
  });
};
