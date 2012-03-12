var util = require('util');

exports = module.exports = MemcachedMap;

function MemcachedMap(client, id){
  this.client = client;
  this.id = id;

  this.MAP_KEY_TMPL = util.format('map/%s$%s', id);
}
MemcachedMap.prototype.end = function (cb){
  // nop
  return cb();
};
MemcachedMap.prototype.set = function(key, value, expires, cb){
  var mapKey = util.format(this.MAP_KEY_TMPL, key);
  return this.client.set(mapKey, value, expires, cb);
};
MemcachedMap.prototype.get = function(key, cb){
  var mapKey = util.format(this.MAP_KEY_TMPL, key);
  return this.client.get(mapKey, cb);
};
MemcachedMap.prototype.has = function(key, cb){
  var mapKey = util.format(this.MAP_KEY_TMPL, key);
  return this.client.get(mapKey, function(err, value){
    if(err){
      return cb(err, null);
    }
    if(false === value){
      return cb(null, false);
    }
    return cb(null, true);
  });
};
MemcachedMap.prototype.del = function(key, cb){
  var mapKey = util.format(this.MAP_KEY_TMPL, key);
  return this.client.del(mapKey, cb);
};
