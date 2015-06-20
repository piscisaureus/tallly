
module.exports = getMessages;

function getMessages(github, issue, callback) {
  var page = 1;
  var perPage = 100;
  
  var messages = [issue];
  
  getPage();
  
  function getPage() {
    var options = {
      user: issue.repository.owner.login,
      repo: issue.repository.name,
      number: issue.number,
      page: page, 
      perPage: perPage
    }
    github.issues.getComments(options, onPage);
  }
  
  function onPage(err, result) {
    if (err)
      return callback(err);
  
    messages = messages.concat(result);
    
    if (result.length < perPage)
      return callback(null, messages);
        
    // Fetch more comments
    page++;
    process.nextTick(getPage);
  }
}