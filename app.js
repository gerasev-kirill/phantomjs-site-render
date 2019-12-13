"use strict";
const http       = require('http'),
    env          = process.env,
    phantom      = require('phantom'),
    request      = require("request"),
    cheerio      = require('cheerio'),
    URL          = require('url').URL;




var phInstance = null;
var allowed404Pages = ["/en/404", "/ru/404", "/ua/404", "/cz/404", "/de/404", "/404"]

function createPhantomInstace(cb){
    phantom.create()
        .then(instance => {
            phInstance = instance;
            if (cb){
                cb(phInstance);
            }
        });
}

function dumpUrlToString(self){
    var str = self.origin+self.pathname;
    var params = self.searchParams;
    params.sort();
    params = params.toString();
    if (params){
        return self.origin + self.pathname + '?' + params;
    }
    return self.origin + self.pathname;
}


function composeUrl(url, origin){
    if (url[0] == '/'){
        return new URL(url, origin);
    }
    if (url.indexOf('https://') === -1 && url.indexOf('http://') == -1){
        url = "http://"+url;
    }
    return new URL(url);
}


function getHtmlFromUrl(site_url, res){
    var sitepage = null;
    var handleError = function(error){
        res.setHeader('Content-Type', 'text/html');
        res.write('<small style="color:red;text-align:center;">SITE RENDER ERROR: '+error+'</small>');
        return res.end();
    }

    phInstance.createPage()
        .then(page => {
            sitepage = page;
            page.setContent("", site_url); // doesn't actually open any page
            // gdpr storage
            page.evaluate(function(){
                localStorage.setItem("$lb$gdprPermission", JSON.stringify({"app":true, "*": true, "googleTagManager": true}));
            });
            page.property('onError', function(msg, trace) {
                var msgStack = ['ERROR: ' + msg];
                if (trace && trace.length) {
                    msgStack.push('TRACE:');
                    trace.forEach(function(t) {
                        msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
                    });
                }
                console.error(msgStack.join('\n'));
            });
            page.property('onConsoleMessage', function(msg, lineNum, sourceId) {
                console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
            });

            return page.open(site_url);
        })
        .then(status => {
            function returnDefaultResponse(){
                setTimeout(function(){
                    sitepage.evaluate(function(){
                        var clN = null;
                        var hasPreloader = false;
                        var isReady = false
                        for (var i = 0; i < document.body.childNodes.length; i++) {
                            clN = document.body.childNodes[i].className || '';
                            if (clN.indexOf('preloader') > -1){
                                // нашли прелоадер
                                hasPreloader = true;
                                if (clN.indexOf('ng-hide') > -1){
                                    isReady = true;
                                }
                            }
                        }
                        if (hasPreloader){
                            return {isReady: isReady, hasPreloader: hasPreloader};
                        }
                        return {isReady: true};
                    }).then(
                        result => {
                            console.log('READY INFO', result);
                            if (!result.isReady){
                                return returnDefaultResponse();
                            }
                            sitepage.property('content').then(
                                obj =>{
                                    return new Promise(function(resolve, reject){
                                        sitepage.evaluate(function(){
                                            return location.pathname;
                                        })
                                        .then(url => {
                                            url = url || '';
                                            if (url[url.length-1] == '/'){
                                                url = url.slice(0, -1)
                                            }
                                            if (allowed404Pages.indexOf(url)>-1){
                                                res.statusCode = 404;
                                            }
                                            res.setHeader('Content-Type', 'text/html');
                                            // выкидываем все теги <script> чтоб гуглебот не запускал снова js и не давился ошибками
                                            var $ = cheerio.load(obj, {decodeEntities: true});
                                            $('script').remove();
                                            res.write($.html({decodeEntities: false}));
                                            return resolve(res.end());
                                        })
                                        .catch(error => {
                                            return handleError(error);
                                        });
                                    });
                                }
                            );
                        }
                    );
                }, 2000);
            }


            sitepage.evaluate(function(){
                try {
                    return {
                        baseUrl: CMS_BASE_URL || location.origin,
                        dbBucket: CMS_DB_BUCKET,
                        locationOrigin:location.origin,
                    }
                } catch (e) {
                    return {
                        locationOrigin: location.origin
                    }
                }
            }).then(cms_vars=>{
                var options = {
                    url:cms_vars.baseUrl+'/api/v1/CmsSettings/findOne?x_db_bucket',
                    json: true,
                    headers:{
                        'X-Db-Bucket': cms_vars.dbBucket
                    }
                };
                request(options, function(err, response, body){
                    if (err){
                        return returnDefaultResponse();
                    }
                    if (!body || !body.siteRedirections || !body.siteRedirections.length){
                        return returnDefaultResponse();
                    }
                    var r, redirectCode, fromUrl, toUrl,
                        currentUrl = composeUrl(site_url);
                    for (var i = 0; i < body.siteRedirections.length; i++) {
                        r = body.siteRedirections[i];
                        if (!r || !r.fromUrl || !r.toUrl){
                            continue;
                        }
                        fromUrl = composeUrl(r.fromUrl, cms_vars.locationOrigin);
                        toUrl = composeUrl(r.toUrl, cms_vars.locationOrigin);
                        if (dumpUrlToString(fromUrl) === dumpUrlToString(currentUrl) && dumpUrlToString(toUrl) !== dumpUrlToString(fromUrl)){
                            console.log('redirectTO: ', toUrl);
                            return new Promise(function(resolve, reject){
                                res.writeHead(r.redirectCode || 301, {
                                    Location: toUrl.toString()
                                });
                                return resolve(res.end());
                            })
                        }
                    }
                    // ни одно правило не подошло
                    return returnDefaultResponse();
                });

            });


        })
        .catch(error => {
            return handleError(error);
        });
}









createPhantomInstace();

let server = http.createServer(function (req, res) {
    let url = req.url;

    if (url.startsWith('/render') || url == '/'){
        var site_url = url.split('$$$$')[1];
        if (!site_url){
            return res.end();
        }
        try{
            getHtmlFromUrl(site_url,res);
        }
        catch(e){
            console.log('Rerun phantomJS');
            createPhantomInstace(
                function(){
                    getHtmlFromUrl(site_url,res)
                }
            );
        }
        return;
    }
    // IMPORTANT: Your application HAS to respond to GET /health with status 200
    //                        for OpenShift health monitoring
    if (url == '/health') {
        res.writeHead(200);
        res.end();
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(env.NODE_PORT || 3001, function () {
    console.log(`Application worker ${process.pid} started...`);
});
