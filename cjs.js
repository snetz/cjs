function Channel() {
    this.readers = [];
    this.writers = [];
    this.syncing = false;
}

Channel.prototype.read = function (cont) {
    var reader = { cont: cont };
    this.readers.push(reader);
    if (!this.syncing) this.sync();
    return function () {
        var index = this.readers.indexOf(reader);
        this.readers.splice(index, 1);
    }.bind(this);
};

Channel.prototype.write = function (value, cont) {
    var writer = { cont: cont, value: value };
    this.writers.push(writer);
    if (!this.syncing) this.sync();
    return function () {
        var index = this.writers.indexOf(writer);
        this.writers.splice(index, 1);
    }.bind(this);
};

Channel.prototype.sync = function () {
    this.syncing = true;
    setImmediate(function () {
        if (this.readers.length > 0 && this.writers.length > 0) {
            var reader = this.readers.shift();
            var writer = this.writers.shift();
            writer.cont();
            reader.cont(writer.value);
            this.sync();
        } else {
            this.syncing = false;
        }
    }.bind(this));
};

Channel.prototype.readEvent = function () {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        baseEvents.push(new ReadEvent(this, wrapFunction));
        cont(null);
    }.bind(this));
};

Channel.prototype.writeEvent = function (value) {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        baseEvents.push(new WriteEvent(this, value, wrapFunction));
        cont(null);
    }.bind(this));
};

function ReadEvent(channel, wrapFunction) {
    this.channel = channel;
    this.wrapFunction = wrapFunction;
}

ReadEvent.prototype.wait = function (cont) {
    return this.channel.read(cont);
};

function WriteEvent(channel, value, wrapFunction) {
    this.channel = channel;
    this.value = value;
    this.wrapFunction = wrapFunction;
};

WriteEvent.prototype.wait = function (cont) {
    return this.channel.write(this.value, cont);
};

function Event(prepare) {
    this.prepare = prepare;
}

Event.prototype.wrap = function (f) {
    return wrap(this, f);
};

Event.prototype.wrapAbort = function (f) {
    return wrapAbort(this, f);
};

Event.prototype.or = function (event) {
    return chooseBinary(this, event);
};

Event.prototype.sync = function (cont) {
    return sync(this, cont);
};

Event.prototype.timeout = function (ms) {
    return timeout(this, ms);
};

function always(value) {
    var channel = new Channel();
    (function loop() {
        channel.write(value, loop);
    }());
    return channel.readEvent();
}

function never() {
    return new Channel().readEvent();
}

function timeout(event, ms) {
    return guard(function (cont) {
        var channel = new Channel();
        var timeout = setTimeout(function () {
            channel.writeEvent(true).sync(function () {});
        }, ms);
        cont(null, choose([
            event.wrap(function (value, cont) {
                clearTimeout(timeout);
                cont(null, { value: value });
            }),
            channel.readEvent().wrap(function (value, cont) {
                cont(null, { timeout: true });
            })
        ]).wrapAbort(function () { clearTimeout(timeout); }));
    });
}

function guard(f) {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        f(function (error, event) {
            if (error) {
                cont(error);
            } else {
                event.prepare(baseEvents, wrapFunction, abortChannel, cont);
            }
        });
    });
}

function wrap(event, f) {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        event.prepare(baseEvents, function (value, cont) {
            wrapFunction(value, function (error, value) {
                if (error) {
                    cont(error);
                } else {
                    f(value, cont);
                }
            })
        }, abortChannel, cont);
    });
}

function wrapAbort(event, f) {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        var index = baseEvents.length;
        event.prepare(baseEvents, wrapFunction, abortChannel, function (error) {
            if (error) {
                cont(error);
            } else {
                var childBaseEvents = baseEvents.slice(index);
                abortChannel.read(function (baseEvent) {
                    if (childBaseEvents.indexOf(baseEvent) === -1) {
                        f();
                    }
                });
                cont(null);
            }
        });
    });
}

function chooseBinary(e1, e2) {
    return new Event(function (baseEvents, wrapFunction, abortChannel, cont) {
        e1.prepare(baseEvents, wrapFunction, abortChannel, function (error) {
            if (error) {
                cont(error);
            } else {
                e2.prepare(baseEvents, wrapFunction, abortChannel, cont);
            }
        });
    });
}

function choose(events) {
    return events.reduce(chooseBinary);
}

function select(events, cont) {
    sync(choose(events), cont);
}

function range(a, b) {
    var l = [];
    for (var i = a; i <= b; i++) l.push(i);
    return l;
}

function randomize(l) {
    for (var i = 0; i < l.length; i++) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = l[i];
        l[i] = l[j];
        l[j] = t;
    }
}

function sync(event, cont) {
    cont = cont || function () {};
    var baseEvents = [];
    var wrapFunction = function (value, cont) {
        cont(null, value);
    };
    var abortChannel = new Channel();
    event.prepare(baseEvents, wrapFunction, abortChannel, function (error) {
        if (error) return cont(error);
        var indices = range(0, baseEvents.length - 1);
        randomize(indices);
        var cancelFunctions = [];
        var done = false;
        (function helper(n) {
            if (n !== indices.length && !done) {
                var baseEvent = baseEvents[indices[n]];
                var cancelFunction = baseEvent.wait(function (value) {
                    done = true;
                    cancelFunctions.forEach(function (cancelFunction) {
                        cancelFunction();
                    });
                    baseEvent.wrapFunction(value, cont);
                    (function spawnAbortFunction() {
                        abortChannel.write(baseEvent, spawnAbortFunction);
                    }());
                });
                cancelFunctions.push(cancelFunction);
                helper(n + 1);
            }
        }(0));
    });
}

function newChannel() {
    return new Channel();
}

module.exports = {
    Channel: Channel,
    newChannel: newChannel,
    guard: guard,
    wrap: wrap,
    wrapAbort: wrapAbort,
    chooseBinary: chooseBinary,
    choose: choose,
    select: select,
    sync: sync,
    timeout: timeout,
    never: never,
    always: always
};
