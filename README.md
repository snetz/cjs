Readme
======

Concurrent ML in Javascript.

``` js
var cjs = require('cjs');
var channel = cjs.newChannel();
channel.read(function(value) {
	console.log('value read', value);
});
channel.write(123, function() {
	console.log('value written');
});
```


