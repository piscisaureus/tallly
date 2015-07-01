
module.exports = UpdatedIssueStream;


var assert = require('assert');
var inherits = require('util').inherits;
var extend = require('util')._extend;
var Readable = require('stream').Readable;


function UpdatedIssueStream(client, query, state) {
  Readable.call(this, { objectMode: true });

  this._client = client;
  this._fetching = false;
  this._perPage = 64;
  this._pollTimer = null;
  this._pollDelay = 10 * 1000;
  this._fetching = false;
  this._query = query;

  this._etag = (state && state.etag) || null;
  this._since = (state && state.since) || null;
  this._page = (state && state.page) || 1;
  this._processedIssues = (state && state.processedIssues) || {};
  this._queue = (state && state.queue) || [];
}

inherits(UpdatedIssueStream, Readable);


UpdatedIssueStream.prototype._read = function() {
  var chunk = this._queue.shift();

  if (chunk)
    return this.push(chunk);

  if (this._fetching || this._pollTimer)
    return;

  this._fetch();
};


UpdatedIssueStream.prototype._poll = function() {
  assert(this._pollTimer);
  assert(this._fetching === false);

  this._pollTimer = null;

  this._fetch();
};


UpdatedIssueStream.prototype._fetch = function() {
  assert(this._pollTimer === null);
  assert(this._fetching === false);

  this._fetching = true;

  var query = {
    page: this._page,
    per_page: this._perPage,
    sort: 'updated',
    direction: 'asc',
    headers: {}
  };

  query = extend(query, this._query);
  if (this._since)
    query.since = new Date(this._since).toISOString();
  if (this._etag)
    query.headers['If-none-match'] = this._etag;

  this._client.issues.getAll(query, this._onIssues.bind(this));
};


UpdatedIssueStream.prototype._onIssues = function(err, issues) {
  assert(this._pollTimer === null);
  assert(this._fetching === true);

  this._fetching = false;

  if (!err) {
    this._etag = null;

    if (issues.length === this._perPage)
      this._page++;
    else if (this._page > 1)
      this._page = 1;
    else
      this._etag = issues.meta.etag;

    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var updated = Date.parse(issue.updated_at);
      var url = issue.url;

      assert(updated >= this._since);

      if (updated > this._since) {
        this._since = updated;
        this._processedIssues = {};
        this._page = 1;
        this._etag = null;
      }

      if (url in this._processedIssues)
        continue;
      else
        this._processedIssues[url] = true;

      this._queue.push(issue);
    }

    var chunk = this._queue.shift();
    if (chunk)
      return this.push(chunk);
  }

  this._pollTimer = setTimeout(this._poll.bind(this), this._pollDelay);
};

