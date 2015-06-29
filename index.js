
var assert = require('assert');
var GitHubApi = require('github');
var UpdatedIssueStream = require('./updated-issue-stream');

var github = new GitHubApi({
    // required
    version: '3.0.0',
    // optional
    protocol: 'https',
    timeout: 10000,
    headers: {
        'user-agent': 'My-Cool-GitHub-App' // GitHub is happy with a unique user agent
    }
});

github.authenticate({
    type: 'basic',
    username: 'piscisaureus',
    password: require('fs').readFileSync('.password', 'utf8').replace(/\s/g, '')
});


var stream = new UpdatedIssueStream(github, { filter: 'mentioned', state: 'all' });
stream.on('data', function(data) {
  console.log(data.updated_at, data.url.replace('https://api.github.com/', ''));
});


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
