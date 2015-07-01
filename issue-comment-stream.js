
module.exports = IssueCommentStream;

var assert = require('assert');
var inherits = require('util').inherits;
var Readable = require('stream').Readable;


function IssueCommentStream(client, issue) {
  Readable.call(this, { objectMode: true });

  this._client = client;
  this._issue = issue;

  this._queue = [];
  this._fetching = false;
  this._ended = false;
  this._page = 1;
  this._perPage = 64;
  this._retryDelay = 60 * 1000;
}

inherits(IssueCommentStream, Readable);

IssueCommentStream.prototype._read = function() {
  var next = this._queue.shift();
  if (next)
    return this.push(next);

  if (this._ended)
    return this.push(null);

  if (this._fetching)
    return;

  this._fetch();
};


IssueCommentStream.prototype._fetch = function() {
  assert(!this._fetching);
  this._fetching = true;

  var issue = this._issue;
  var repo = issue.repository;

  var query = {
    user: repo.owner.login,
    repo: repo.name,
    number: issue.number,
    page: this._page,
    per_page: this._perPage,
    sort: 'created',
    direction: 'asc'
  };

  this._client.issues.getComments(query, this._onComments.bind(this));
};


IssueCommentStream.prototype._onComments = function(err, comments) {
  if (err)
    return setTimeout(this._fetch.bind(this), this._retryDelay);

  assert(this._fetching);
  this._fetching = false;

  assert(!this._queue.length);
  assert(!this._ended);
  this._queue = comments;

  if (comments.length < this._perPage)
    this._ended = true;
  else
    this._page++;

  var next = comments.shift() || null;
  this.push(next);
};
