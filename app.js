"use strict";
const http       = require('http'),
    env          = process.env,
    phantom      = require('phantom');




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
            return page.open(site_url);
        })
        .then(status => {
            var content = sitepage.property('content');
            content.then(
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
                            res.write(obj);
                            return resolve(res.end());
                        })
                        .catch(error => {
                            return handleError(error);
                        });
                    });
                }
            );
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
