var util = require('util')
  , crypto = require('crypto')
  , MemcachedList = require('./list')
  ;

exports = module.exports = MemcachedSet;

function MemcachedSet(client, id, opts){
  opts = opts || {};

  this.client = client;
  this.id = id;
  this.options = opts;

  this.INCREMENT_KEY = util.format('set/%s.increment', id);
  this.SET_HASH_TMPL = util.format('set/%s@%s', id);
  this.LIST_KEY_TMPL = util.format('set/%s#%d', id);
};
MemcachedSet.prototype.__proto__ = MemcachedList.prototype;
MemcachedSet.prototype.end = function(cb){
  // nop
  return cb();
};
MemcachedSet.prototype.createHash = function(value){
  var md5 = crypto.createHash('md5');
  md5.update(String(value));
  return md5.digest('hex');
};
MemcachedSet.prototype.add = function(value, expires, cb){
  var id = this.id;
  var client = this.client;
  var LIST_KEY_TMPL = this.LIST_KEY_TMPL;

  var self = this;
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

      var listKey = util.format(LIST_KEY_TMPL, nextId);
      return client.set(listKey, value, expires, function(err, set){
        if(err){
          return cb(err);
        }
        return cb(null, false, nextId);
      });
    });
  });
};
MemcachedSet.prototype.has = function(value, expires, cb){
  var client = this.client;
  var hash = this.createHash(value);
  var setKey = util.format(this.SET_HASH_TMPL, hash);

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
