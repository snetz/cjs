# Concurrent Javascript

# Examples

## read/write

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

## forever

``` js
var cjs = require('cjs');
var channel = cjs.newChannel();
(function loop() {
	channel.read(function(value) {
		console.log('value read', value);
		loop();
	});	
}());
(function loop() {
	channel.write(123, function() {
		console.log('value written');
		loop();
	});
}());
```

## readEvent/writeEvent

``` js
var cjs = require('cjs');
var channel1 = cjs.newChannel();
var channel2 = cjs.newChannel();
cjs.select([
	channel1.readEvent(),
	channel2.readEvent()
]);
channel1.write(1, function() {
	console.log('1 written');
});
channel2.write(2, function() {
	console.log('2 written');
});
```

