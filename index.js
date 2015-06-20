
var assert = require('assert');
var inherits = require('util').inherits;
var extend = require('util')._extend;
var GitHubApi = require("github");
var Readable = require('stream').Readable;

var github = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    protocol: "https",
    timeout: 5000,
    headers: {
        "user-agent": "My-Cool-GitHub-App", // GitHub is happy with a unique user agent
    }
});

github.authenticate({
    type: "basic",
    username: 'piscisaureus',
    password: require('fs').readFileSync('.password', 'utf8').replace(/\s/g, '')
});


/*
var page = 1;
var perPage = 100;

var since = '2000-01-01T00:00:00Z'




function go() {
  github.issues.getAll({ filter: 'all', page: page, sort: 'updated', direction: 'asc', perPage: perPage, since: since }, onIssuesPage);

  function onIssuesPage(err, result) {
    if (err)
      throw err;
    if (!result.length)
      return;
    console.log(result);
    var issue = result[0];
    
    console.log(issue.title, issue.number, issue.updated_at);
    
    if (result.length < 2)
      return;
    
    since = result[result.length - 1].updated_at;
    go();
  }
}
go(); 
*/


function UpdatedIssueStream(client, query, state) {
  Readable.call(this, { objectMode: true });

  this._client = client;
  this._fetching = false;
  this._query = query;
  this._page = 1;
  this._perPage = 100;
  this._retryTimer = null;
  this._retryDelay  = 10 * 1000;
  this._fetching = false;
  this._queue = [];
  
  this._since = (state && state.since) || Date.parse('2000-01-01');
  this._processedIssues = (state && state.processedIssues) || {};
}

inherits(UpdatedIssueStream, Readable);


UpdatedIssueStream.prototype._read = function() {
  var chunk = this._queue.shift();
  
  if (chunk)
    return this.push(chunk.title + '\n');
  
  if (this._fetching || this._retryTimer)
    return;
  
  this._fetch();
}

UpdatedIssueStream.prototype._retry = function() {
  this._retryTimer = null;
  this._fetch();
}

UpdatedIssueStream.prototype._fetch = function() {
  this._fetching = true;
   console.log('fetch');
   
  var query = {
    page: this._page,
    perPage: 100,//this._perPage,
    sort: 'updated',
    direction: 'asc',
    since: new Date(this._since).toISOString().replace('.000', '')
  };
  query = extend(query, this._query);

  this._client.issues.getAll(query, this._onIssues.bind(this));
}


UpdatedIssueStream.prototype._onIssues = function(err, issues) {
  assert(this._retryTimer === null);
  assert(this._fetching);
  
  this._fetching = false;
  
  if (err)
    return this.emit('error', err);
  
  var pushed = false;
  var since = this._since;
  
  if (issues.length === this._perPage) {
    this._page++;
  } else {
    this._page = 1;
  }
  
  for (var i = 0; i < issues.length; i++) {
    var issue = issues[i];
    var updated = Date.parse(issue.updated_at);
    var url = issue.url;
    
    assert(updated >= this._since);
    
    if (updated > this._since) {
      this._since = updated;
      this._processedIssues = {};
      this._page = 1;
    }
    
    
    if (url in this._processedIssues)
      continue;
    else
      this._processedIssues[url] = true;
    
    this._queue.push(issue);
    pushed = true;
  }
  
  var chunk = this._queue.shift();
  if (chunk)
    this.push(chunk.title + '\n');
  else 
    this._retryTimer = setTimeout(this._retry.bind(this), this._retryDelay);
}


x = new UpdatedIssueStream(github, {filter:'mentioned'});
x.resume();
x.pipe(process.stdout);

/*
function update() {
  function getIssues(callback) {
    var page = 1;
    var perPage = 100;
    var issues = [];
    var pending = 0;
    var error = null;
    
    getIssuesPage();
    
    function getIssuesPage() {
      ++pending;
      github.issues.getAll({ filter: 'mentioned', page: page, sort: 'created', direction: 'asc', perPage: perPage}, onIssuesPage);
    }
    
    function onIssuesPage(err, result) {
      --pending;
      
      if (err) {
        error = err;
        return maybeCallback();
      }
      
      for (var i = 0; i < result.length; i++) {
        ++pending;
        getCommentsForIssue(result[i], onIssuesLoaded);
      }
    
      issues = issues.concat(result);
      
      if (result.length === perPage) {
        // Fetch more issues
        page++;
        getIssuesPage();
      }
      
      maybeCallback();
    }
    
    function onIssuesLoaded(err) {
      --pending;
      
      if (err)
        error = err;
    
      maybeCallback();
    }
    
    function maybeCallback() {
      if (pending)
        return;
      else if (error)
        callback(error);
      else
        callback(null, issues);
    }
  }





  function processIssues(err, issues) {
    for (var i = 0; i < issues.length; i++)
      processIssue(issues[i], console.log);
  }


  getIssues(processIssues);


  function processIssue(issue, callback) {
    var messages = issue.messages;
    
    console.log(messages);

    var replyIndex = {};
    
    var outgoing = [];
    var poll = null;
        
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];

      if (message.user.login !== 'tallly') {
        if (/@tallly/i.test(message.body)) {
          // Interpret as a tallly command.
          if (!poll) {
            // Start a new poll
            poll = new Poll();
            outgoing.push({ replyKey: 'status:' + message.id, trigger: message, poll: poll, type: 'start' });
            
          } else {
            // A poll is already happening
            outgoing.push({ replyKey: 'status:' + message.id, trigger: message, type: 'error-already' })
          }
          
        } else if (poll) {
          // Interpret as a potential vote
          var m = /^\s*\:?([+-][01])(?:\:|\s|$)/.exec(message.body);
          if (m) {
            var value = +m[1] ? m[1] : '0';
            poll.vote({ user: message.user.login, value: value, html_url: message.html_url });
            
          } else {
            // Not a vote.
          }
        } else {
          // No active poll.
        }
      
      } else {
        // This message was posted by tallly itself.
        // Index it (so we can update it later), or mark it for disposal if the
        // message couldn't be interpreted.
        var m = /^\<!--tallly:(.*?)-->\s*$/m.exec(message.body);
        if (m)
          replyKey = m[1];
        else
          replyKey = 'garbage-' + message.id;
        
        replyIndex[replyKey] = { message: message, action: 'delete', replyKey: replyKey };
      }
    }
    
    for (var i = 0; i < outgoing.length; i++) {
      var reply = outgoing[i];
      var msg = '';
      var replyKey = reply.replyKey;

      // Add trigger
      msg = '@' + reply.trigger.user.login + '\n';
      msg += reply.trigger.body.replace(/\r/g, '').replace(/^/gm, '> ') + '\n';
      msg += '\n';
      
      switch (reply.type) {
        case 'start':
          // Add response
          msg += 'Poll started\n';
          msg += '\n';

          // Add summary table
          msg += '| vote | # | users |\n';
          msg += '|:----:|:-:|-------|\n';
          for (var value in reply.poll.byValue) {
            var votes = reply.poll.byValue[value];
            var count = Object.keys(votes).length;
            if (count === 0)
              continue;
            var refs = [];
            for (var user in votes)
              refs.push('[@' + user + '](' + votes[user].html_url + ')');
            msg += '| ' + value + ' | ' + Object.keys(votes).length + ' | ' + refs.join(', ') + ' |\n';
          }
          msg += '\n';
          
          // Add last-updated notification
          msg += 'Last updated: ' + (new Date()).toString() + '\n';
          msg += '\n';
          
          break;
        
        case 'error-already':
          // Add trigger
          msg = '@' + reply.trigger.user.login + '\n';
          msg += reply.trigger.body.replace(/^/gm, '> ');
          msg += '\n';
          msg += '\n';
          
          // Add response
          msg += 'A poll couldn\'t be started because another poll is already active.\n';
          msg += '\n';

          break;
      
        default:
          assert(0);
      }
      
      // Remember why we posted this reply
      msg += '<!--tallly:' + replyKey + '-->';

      // Add to the message index
      if (!replyIndex[replyKey])
        replyIndex[replyKey] = { action: 'create', replyKey: replyKey, body: msg };
      else if (replyIndex[replyKey].message.body === msg)
        replyIndex[replyKey].action = 'keep';
      else {
        replyIndex[replyKey].action = 'update';
        replyIndex[replyKey].body = msg;
      }
    }
    
    for (var key in replyIndex) {
      var reply = replyIndex[key];
      switch (reply.action) {
        case 'keep':
          // Do nothing;
          break;
        
        case 'create':
          var options = {
            user: issue.repository.owner.login,
            repo: issue.repository.name,
            number: issue.number,
            body: reply.body
          }
          github.issues.createComment(options, onDone);
          break;
        
        case 'update':
          var options = {
            user: issue.repository.owner.login,
            repo: issue.repository.name,
            id: reply.message.id,
            body: reply.body
          }
          github.issues.editComment(options, onDone);
          break;
          
        case 'delete':
          var options = {
            user: issue.repository.owner.login,
            repo: issue.repository.name,
            id: reply.message.id,
          };
          console.log(options);
          github.issues.deleteComment(options, onDone);
          break;
          
        default:
          assert(0);
      }
    }
  }


  function onDone(err, res) {
    if (err) throw err;
    console.log(res);
  }


  function Poll() {
    this.byUser = Object.create(null);
    this.byValue = Object.create(null);
  }

  Poll.prototype.vote = function vote(vote) {
    if (vote.user in this.byUser) {
      delete this.byValue[this.byUser[vote.user].value][vote.user];
      delete this.byUser[vote.user];
    }
     
    if (vote.value == null)
      return;
    
    this.byUser[vote.user] = vote;
    if (!this.byValue[vote.value])
      this.byValue[vote.value] = {};
    this.byValue[vote.value][vote.user] = vote;
  }
}

update();

*/