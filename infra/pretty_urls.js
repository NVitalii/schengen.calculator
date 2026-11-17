// CloudFront Function (viewer request) for schengen.live: language pages live
// at folder addresses, /de/, /uk/, ... (one indexable address per language,
// named in every page's hreflang links and in sitemap.xml). S3 has no index
// documents behind CloudFront (default_root_object covers "/" only), so:
//   /de/            -> served from /de/index.html (internal rewrite)
//   /de             -> 301 /de/
//   /de/index.html  -> 301 /de/   (one address per page; the root's
//                                  /index.html is left alone)
// Query strings survive the redirects. Anything with a file extension, and
// the root itself, passes through untouched.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (uri === "/") return request;

    if (uri.length > 11 && uri.slice(-11) === '/index.html') {
        return redirect(uri.slice(0, -10), request.querystring);
    }
    if (uri.slice(-1) === '/') {
        request.uri = uri + 'index.html';
        return request;
    }
    var last = uri.slice(uri.lastIndexOf('/') + 1);
    if (last.indexOf('.') === -1) {
        return redirect(uri + '/', request.querystring);
    }
    return request;
}

function redirect(location, querystring) {
    var parts = [];
    for (var key in querystring) {
        var entry = querystring[key];
        if (entry.multiValue) {
            for (var i = 0; i < entry.multiValue.length; i++) {
                parts.push(key + '=' + entry.multiValue[i].value);
            }
        } else {
            parts.push(entry.value === '' ? key : key + '=' + entry.value);
        }
    }
    return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            location: { value: location + (parts.length ? '?' + parts.join('&') : '') },
            'cache-control': { value: 'max-age=3600' },
        },
    };
}
