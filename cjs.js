var ws = require('ws');
var request = require('request');
var events = require('events');
var util = require('util');

function Element(page, tabId, elementId) {

    return {
        
    }
}

function Page(client, tabId) {
    var emitter = new events.EventEmitter();

    function emit() {
        emitter.emit.apply(emitter, arguments);
    }

    function evalAsync(fun, args, callback) {
        client.evalAsyncTab(tabId, fun, args, callback);
    }

    function getDomAsHtml(callback) {
        client.evalAsyncTab(tabId, function (args, callback) {
            var serializer = new XMLSerializer();
            var html = serializer.serializeToString(document.body);
            callback(null, html);
        }, {
        }, function (error, result) {
            callback(error, result);
        });
    }

    function getDomAsJson(callback) {
        client.evalAsyncTab(tabId, function (args, callback) {
            var tree = getDomTree(document.documentElement);
            callback(null, JSON.stringify(tree, null, 4));
        }, {
        }, function (error, result) {
            callback(error, result);
        });
    }

    function getForms(callback) {
        client.evalAsyncTab(tabId, function (args, callback) {
            var forms = getForms();
            callback(null, JSON.stringify(forms, null, 4));
        }, {
        }, function (error, result) {
            callback(error, result);
        });
    }

    return {
        on: emitter.on.bind(emitter),
        addListener: emitter.addListener.bind(emitter),
        removeListener: emitter.removeListener.bind(emitter),
        evalAsync: evalAsync,
        //waitForCondition: waitForCondition,
        getDomAsHtml: getDomAsHtml,
        getDomAsJson: getDomAsJson,
        //getLinks: getLinks,
        getForms: getForms,
        //querySelector: querySelector
    }
}

function ChromeClient(options) {
    var emitter = new events.EventEmitter();
    var sessionInfo = null;
    var socket = null;
    var uniqueRequestId = 1024;
    var responseHandlers = {};
    var pages = {}; // tabId -> Page

    function emit() {
        emitter.emit.apply(emitter, arguments);
    }

    function handleError(error) {
        emitter.emit('error', error);
    }

    request({
        method: "POST",
        uri: options.serviceUrl
    }, function (err, res, body) {
        if (err) handleError(err);
        if (res.statusCode !== 200) handleErr('http error: ' + res.statusCode);
        sessionInfo = JSON.parse(body);
        console.log(sessionInfo);
        connectWebSocket();
    });

    function handleResponse(message) {
        var responseHandler = responseHandlers[message.id];
        if (responseHandler) {
            delete responseHandlers[message.id];
            responseHandler(message.error, message.result);
        }
        else {
            handleError('no matching response handler found');
        }
    }

    function handleEvent(event) {
        // console.log('handleEvent', event);
        switch (event.event) {
            case 'pageOpened':
                console.log('pageOpened', event);
                break;
            case 'pageClosed':
                console.log('pageClosed', event);
                break;
            case 'pageChanged':
                console.log('pageChanged', event);
                break;
            default:
                handleError('unknwon event received: ' + event.type);
        }
    }

    function connectWebSocket() {
        socket = new ws(sessionInfo.client_url);
        socket.on('open', function () {
            console.log('websocket connection established');
            emit('ready');
        });

        socket.on('error', function (error) {
            console.log('websocket error', error);
            handleError(error);
        });

        socket.on('close', function () {
            console.log('websocket closed', arguments);
            handleError(error);
        });

        socket.on('message', function (data, flags) {
            console.log('websocket message received');
            var message = JSON.parse(data);
            if (message.type === 'response') {
                handleResponse(message);
            }
            else if (message.type === "event") {
                handleEvent(message);
            }
            else {
                console.log('unexpected message', message);
                handleError('unexpected message ' + message);
            }
        });
    }

    function invoke(method, params, callback) {
        var id = uniqueRequestId++;
        responseHandlers[id] = callback;
        socket.send(JSON.stringify({
            type: 'request',
            id: id,
            method: method,
            params: params
        }));
    }

    function evalAsync(fun, args, callback) {
        invoke('evalAsync', {
            fun: fun.toString(),
            args: args
        }, callback);
    }

    function evalAsyncTab(tabId, fun, args, callback) {
        invoke('evalAsyncTab', {
            tabId: tabId,
            fun: fun.toString(),
            args: args
        }, callback);
    }

    function openPage(url, callback) {
        invoke('openTab', {
            url: url
        }, function (error, tab) {
            var page = Page({
                evalAsyncTab: evalAsyncTab
            }, tab.id);
            callback(error, page);
        });
    }

    return {
        on: emitter.on.bind(emitter),
        addListener: emitter.addListener.bind(emitter),
        removeListener: emitter.removeListener.bind(emitter),
        invoke: invoke,
        evalAsync: evalAsync,
        evalAsyncTab: evalAsyncTab,
        openPage: openPage
    }
}

(function () {
    var browser = new ChromeClient({
        serviceUrl: 'http://browser.scycloud.com/sessions'
    });
    browser.on('error', function (error) {
        throw error;
    });
    browser.on('ready', function () {
        console.log('browser ready');

        browser.on('pageOpened', function (page) {
            console.log('new page opened');
        });
        browser.on('pageClosed', function (page) {
            console.log('page closed');
        });
        browser.on('pageChanged', function (page) {
            console.log('page changed');
        });

        browser.openPage('http://google.de', function (error, page) {
            if (error) throw error;
            console.log('openPage OK');
            page.getDomAsJson(function (error, json) {
                console.log('getDomAsHtml');
                if (error) throw error;
                //console.log(json);
            });

            page.getForms(function (error, forms) {
                if (error) throw error;
                //forms[0].submit();
                console.log(forms);
            });

        });

        browser.evalAsync(function (args, callback) {
            callback(null, args.a + args.b);
        }, {
            a: 1,
            b: 123
        }, function (error, result) {
            if (error) throw error;
            console.log('sum', result);
        });
    });
})();

function usage() {
    var ChromeClient = require('chrome-client');
    var browser = new ChromeClient({
        serviceUrl: 'http://browser.scycloud.com'
    });
    browser.on('ready', function () {

        browser.evalAsync(function (params, callback) {
            chrome.tabs.create({
                url: params.url
            }, {
                url: 'http://heise.de'
            }, function (tab) {
                callback(null, tab);
            });
        });

        browser.evalAsyncTab(tabId, function (params, callback) {
            callback(document.body.innerHTML);
        }, {
        }, function (error, result) {
        });

        browser.openPage("http://heise.de", function (error, page) {
            page.on('closed', function () {
            });
            page.on('changed', function () {
            });
            page.evalAsync(function (params, callback) {
                callback(document.body.innerHTML);
            }, {
            }, function (error, result) {
            });
            page.waitForCondition(function (callback) {

            }, function (error, result) {

            });
            page.getDomAsXml(function (error, xml) {
            });
            page.getDomAsHtml(function (error, html) {
            });
            page.getForms(function (error, forms) {
                forms[0].action;
                forms[0].method;
                forms[0].fields[0].name;
                forms[0].fields[1].value;
            });
            page.getLinks(function (error, links) {

            });
            page.querySelector("div[class='article']", function (error, resultList) {

            });
        });

        browser.on('pageOpened', function (page) {

        });
        browser.on('pageClosed', function (page) {

        });
        browser.on('pageChanged', function (page) {

        });
    });
    browser.on('error', function (error) {

    });
}















node browser.js\
 --chrome-executable=/opt/google/chrome/chrome\
 --chrome-extension=chrome-extension\
 --session-directory=sess1\
 --vnc-password=secret\
 --vnc-port=5901\
 --browser-port=10001\
 --client-port=10002\
 --display=28







curl -v -X POST browser.scycloud.com/sessions

> POST /sessions HTTP/1.1
> User-Agent: curl/7.26.0
> Host: browser.scycloud.com
> Accept: */*

< HTTP/1.1 200 OK
< x-powered-by: Express
< date: Mon, 15 Jul 2013 14:53:54 GMT
< connection: keep-alive
< transfer-encoding: chunked
{
    "client_url": "ws://144.76.8.39:9003",
    "client_port": 9003,
    "browser_port": 9004,
    "vnc_port": 9005,
    "display": 101
}



var channel1 = new Channel();
var channel2 = new Channel();
 
function spawnProcess1() {
    (function loop() {
        sync(choose([
            channel1.readEvent().wrap(function(value, callback) {
                callback('channel 1: ' + value)
            }),
            channel2.readEvent().wrap(function(value, callback) {
                callback('channel 2: ' + value)
            })
        ]), function(error, value) {
            console.log('value', value);
        });
    })();
}













var channel1 = new Channel();
var channel2 = new Channel();
 
function spawnProcess1() {
    (function loop() {
        var cancel1 = channel1.read(function(value) {
            cancel2();
            console.log('channel 1', value);
            loop();
        });
        var cancel2 = channel1.read(function(value) {
            cancel1();
            console.log('channel 2', value);
            loop();
        });
    })();
}
 
function spawnProcess2() {
    (function loop(n) {
        channel1.write(n, function() {
            loop(n + 1);
        });
    })(0);
}
 
function spawnProcess3() {
    (function loop(n) {
        channel2.write(n, function() {
            loop(n * 1);
        });
    })(0);
}

spawnProcess1();
spawnProcess2();
spawnProcess3();










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
