var util = require('util');

exports = module.exports = MemcachedList;

const INCREMENT_KEY_TMPL = '%s.increment';
const LIST_KEY_TMPL = '%s#%d';

function MemcachedList(client, id){
  this.client = client;
  this.id = id;
}
MemcachedList.prototype.add = function(value, expires, cb){
  var id = this.id;
  var client = this.client;
  return this.increment(expires, function(err, nextId){
    if(err){
      return cb(err, null);
    }

    var listKey = util.format(LIST_KEY_TMPL, id, nextId);
    return client.set(listKey, value, expires, function(err, set){
      if(err){
        return cb(err);
      }
      return cb(null, nextId);
    });
  });
};
MemcachedList.prototype.get = function(index, cb){
  var id = this.id;
  var client = this.client;

  var listKey = util.format(LIST_KEY_TMPL, id, index);
  return client.get(listKey, cb);
};
MemcachedList.prototype.del = function(index, cb){
  var id = this.id;
  var client = this.client;

  var listKey = util.format(LIST_KEY_TMPL, id, index);
  return client.del(listKey, cb);
};
MemcachedList.prototype.increment = function(expires, cb){
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
MemcachedList.prototype.eachAll = function(iterator, cb){
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
MemcachedList.prototype.getAll = function(cb){
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
MemcachedList.prototype.delAll = function(cb){
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
