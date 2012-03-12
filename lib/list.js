var util = require('util');

exports = module.exports = MemcachedList;

function MemcachedList(client, id, opts){
  opts = opts || {};

  this.client = client;
  this.id = id;
  this.options = opts;

  this.INCREMENT_KEY = util.format('list/%s.increment', id);
  this.LIST_KEY_TMPL = util.format('list/%s#%d', id);
}
MemcachedList.prototype.end = function(cb){
  // nop
  return cb();
};
MemcachedList.prototype.add = function(value, expires, cb){
  var client = this.client;
  var LIST_KEY_TMPL = this.LIST_KEY_TMPL;

  return this.increment(expires, function(err, nextId){
    if(err){
      return cb(err, null);
    }

    var listKey = util.format(LIST_KEY_TMPL, nextId);
    return client.set(listKey, value, expires, function(err, set){
      if(err){
        return cb(err);
      }
      return cb(null, nextId);
    });
  });
};
MemcachedList.prototype.get = function(index, cb){
  var client = this.client;

  var listKey = util.format(this.LIST_KEY_TMPL, index);
  return client.get(listKey, cb);
};
MemcachedList.prototype.del = function(index, cb){
  var client = this.client;

  var listKey = util.format(this.LIST_KEY_TMPL, index);
  return client.del(listKey, cb);
};
MemcachedList.prototype.increment = function(expires, cb){
  var client = this.client;
  var incrementKey = this.INCREMENT_KEY;

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
MemcachedList.prototype.eachAll = function(iterator, cb){
  var client = this.client;
  var incrementKey = this.INCREMENT_KEY;

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
MemcachedList.prototype.getAll = function(cb){
  var values = [];
  var options = this.options;
  var self = this;

  if(options.memcachedStoreEnableGetMulti){
    return (function (){
      var client = self.client;
      var LIST_KEY_TMPL = self.LIST_KEY_TMPL;
      var indexes = [];
      return self.eachAll(function(index, next){
        indexes.push(util.format(LIST_KEY_TMPL, index));
        return next(null);
      }, function(err){
        return client.getMulti(indexes, function(err, results){
          if(err){
            return cb(err);
          }
          var values = indexes.map(function(index){
            return results[index];
          });
          return cb(null, values);
        });
      });
    })();
  }

  return this.eachAll(function(index, next){
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
MemcachedList.prototype.delAll = function(cb){
  var client = this.client;
  var incrementKey = this.INCREMENT_KEY;
  var self = this;

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
