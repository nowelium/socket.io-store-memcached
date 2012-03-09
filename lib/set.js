var util = require('util')
  , crypto = require('crypto')
  , MemcachedList = require('./list')
  ;

exports = module.exports = MemcachedSet;

const INCREMENT_KEY_TMPL = 'set/%s.increment';
const SET_HASH_TMPL = 'set/%s@%s';
const LIST_KEY_TMPL = 'set/%s#%d';

function MemcachedSet(client, id){
  this.client = client;
  this.id = id;
  this.serialQueue = [];
  this.running = true;
//  this.dequeue();
};
MemcachedSet.prototype.end = function(cb){
  this.running = false;
  return cb();
};
MemcachedSet.prototype.enqueue = function(q){
  this.serialQueue.push(function(next){
    return q(function(cb){
      var args = Array.prototype.slice.call(arguments, 1);
      cb.apply(null, args);
      return next();
    });
  });
};
MemcachedSet.prototype.dequeue = function(){
  var self = this;
  if(self.serialQueue.length){
    var q = self.serialQueue.shift();
    return q(function (){
      return setTimeout(self.dequeue.bind(self), 0);
    });
  }
  return setTimeout(self.dequeue.bind(self), 300);
};
MemcachedSet.prototype.createHash = function(value){
  var md5 = crypto.createHash('md5');
  md5.update(String(value));
  return md5.digest('hex');
};
MemcachedSet.prototype.add = function(value, expires, cb){
  var id = this.id;
  var client = this.client;

  var self = this;
//  return this.enqueue(function(executor){
    return self.has(value, expires, function(err, exists){
      if(err){
        return cb(err);
      }

      if(exists){
        return cb(null, exists, -1);
      }
      return self.increment(expires, function(err, nextId){
        if(err){
          return cb(err);
        }

        var listKey = util.format(LIST_KEY_TMPL, id, nextId);
        return client.set(listKey, value, expires, function(err, set){
          if(err){
            return cb(err);
          }
          return cb(null, false, nextId);
        });
      });
    });
//  });
};
MemcachedSet.prototype.has = function(value, expires, cb){
  var id = this.id;
  var client = this.client;
  var hash = this.createHash(value);
  var setKey = util.format(SET_HASH_TMPL, id, hash);

  return client.gets(setKey, function(err, gets){
    if(err){
      return cb(err);
    }
    if(false === gets){
      return client.set(setKey, hash, expires, function(err, set){
        if(err){
          return cb(err);
        }
        return cb(null, false);
      });
    }
    return cb(null, true);
  });
};
MemcachedSet.prototype.get = function(index, cb){
  //
  // TODO: MemcachedList impl
  //

  var id = this.id;
  var client = this.client;

  var listKey = util.format(LIST_KEY_TMPL, id, index);
  return client.get(listKey, cb);
};
MemcachedSet.prototype.del = function(index, cb){
  //
  // TODO: MemcachedList impl
  //

  var id = this.id;
  var client = this.client;

  var listKey = util.format(LIST_KEY_TMPL, id, index);
  return client.del(listKey, cb);
};
MemcachedSet.prototype.increment = function(expires, cb){
  //
  // TODO: MemcachedList impl
  //

  var id = this.id;
  var client = this.client;
  var incrementKey = util.format(INCREMENT_KEY_TMPL, id);

  var increment = function (next){
    return client.gets(incrementKey, function(err, gets){
      if(err){
        return next(err, null);
      }
      if(false === gets){
        return client.set(incrementKey, '0', expires, function(err, set){
          if(err){
            return next(err, null);
          }
          return next(null, 0);
        });
      }

      var casValue = gets.cas;
      var nextId = 1 + Number(gets[incrementKey]);
      return client.cas(incrementKey, nextId, casValue, expires, function(err, cas){
        if(err){
          return next(err, null);
        }
        if(false === cas){
          return increment(next);
        }
        return next(null, nextId);
      });
    });
  };
  return increment(cb);
};
MemcachedSet.prototype.eachAll = function(iterator, cb){
  //
  // TODO: MemcachedList impl
  //
  var id = this.id;
  var client = this.client;
  var incrementKey = util.format(INCREMENT_KEY_TMPL, id);
  var self = this;

  return client.get(incrementKey, function(err, getIncrementValue){
    if(err){
      return cb(err);
    }
    if(false === getIncrementValue){
      return cb(null);
    }

    var incrementValue = Number(getIncrementValue);
    var indexes = [];
    for(var i = incrementValue; 0 <= i; --i){
      indexes.push(i);
    }
    var each = function(iter, next){
      if(indexes.length < 1){
        return next(null);
      }
      var index = indexes.shift();
      return iter(index, function(err){
        if(err){
          return next(err);
        }
        return each(iter, next);
      });
    };
    return each(iterator, cb);
  });
};
MemcachedSet.prototype.getAll = function(cb){
  //
  // TODO: MemcachedList impl
  //
  var values = [];
  var self = this;
  return this.eachAll(function(index, next){
    // TODO: get multi
    return self.get(index, function(err, get){
      if(err){
        return next(err);
      }

      if(false !== get){
        values.push(get);
      }
      return next(null);
    });
  }, function(err){
    if(err){
      return cb(err);
    }
    return cb(null, values);
  });
};
MemcachedSet.prototype.delAll = function(cb){
  //
  // TODO: MemcachedList impl
  //
  var id = this.id;
  var client = this.client;
  var self = this;
  var incrementKey = util.format(INCREMENT_KEY_TMPL, id);

  return this.eachAll(function(index, next){
    return self.del(index, function(err, get){
      if(err){
        return next(err);
      }
      return next(null);
    });
  }, function(err){
    if(err){
      return cb(err);
    }

    return client.del(incrementKey, function(err){
      if(err){
        return cb(err);
      }
      return cb(null);
    });
  });
};
