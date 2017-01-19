"use strict";
const http       = require('http'),
    env          = process.env,
    phantom      = require('phantom');




var phInstance = null;

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
    phInstance.createPage()
        .then(page => {
            sitepage = page;
            return page.open(site_url);
        })
        .then(status => {
            var content = sitepage.property('content');
            content.then(
                obj =>{
                    res.setHeader('Content-Type', 'text/html');
                    res.write(obj);
                    return res.end();
                }
            );
        })
        .catch(error => {
            res.setHeader('Content-Type', 'text/html');
            res.write('<small style="color:red;text-align:center;">SITE RENDER ERROR: '+error+'</small>');
            return res.end();
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

server.listen(env.NODE_PORT || 3001, env.NODE_IP || 'localhost', function () {
    console.log(`Application worker ${process.pid} started...`);
});
