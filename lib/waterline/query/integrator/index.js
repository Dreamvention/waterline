/**
 * Module dependencies
 */
var anchor = require('anchor');
var _ = require('lodash');
var leftOuterJoin = require('./leftOuterJoin');
var populate = require('./populate');




/**
 * Query Integrator
 *
 * Combines the results from multiple child queries into
 * the final return format using an in-memory join.
 * Final step in fulfilling a `.find()` with one or more
 * `populate(alias[n])` modifiers.
 *
 *    > Why is this asynchronous?
 *    >
 *    > While this function isn't doing anything strictly
 *    > asynchronous, it still expects a callback to enable
 *    > future use of `process[setImmediate|nextTick]()` as
 *    > a potential optimization.
 * 
 * @param  {Object}   cache
 * @param  {Array}    joinInstructions
 * @callback  {Function} cb(err, results)
 *           @param {Error}
 *           @param {Array}  [results, complete w/ populations]
 *
 * @throws {Error} on invalid input
 * @asynchronous
 */
module.exports = function integrate(cache, joinInstructions, cb) {  

  // Ensure valid usage
  var invalid = false;
  invalid = invalid || anchor(cache).to({ type: 'object' });
  invalid = invalid || anchor(joinInstructions).to({ type: 'array' });
  invalid = invalid || anchor(joinInstructions[0]).to({ type: 'object' });
  invalid = invalid || anchor(joinInstructions[0].parent).to({ type: 'string' });
  invalid = invalid || anchor(cache[joinInstructions[0].parent]).to({ type: 'object' });
  invalid = invalid || typeof cb !== 'function';
  if (invalid) return cb(invalid);




  // Nab the name of the parent table and parentKey from the first join so we
  // know our starting point.
  // 
  // (the parent table, the calling Model, `big daddy`, etc.)
  var parent = joinInstructions[0].parent;
  var parentPK = joinInstructions[0].parentKey;
  var parentAttributeNames = Object.keys(cache[parent][0]);
  // console.log('parentAttributeNames:',parentAttributeNames);
  // console.log('\n\n(Results will be composed of ::',parent, ' with PK ::',parentPK);

  // Set up initial `results` as the starting values of the parent table
  // (i.e. "big daddy") in the cache.
  var results = cache[parent];


  // Group the joinInstructions array by alias, then interate over each one
  // s.t. `instructions` in our lambda function contains a list of join instructions
  // for the particular `populate` on the specified key (i.e. alias).
  // 
  // Below, `results` are mutated inline.
  _.each( _.groupBy(joinInstructions, 'alias'),
    function eachAssociation( instructions, alias ) {

      var joinedResults;
    
      // N..N Association
      if ( instructions.length === 2 ) {

        // Calculate and sanitize join data,
        // then shove it into the parent results under `alias`
        joinedResults = _sanitize({
          rows: leftOuterJoin({
            left: leftOuterJoin({
              left: cache[instructions[0].parent],
              right: cache[instructions[0].child],
              leftKey: instructions[0].parentKey,
              rightKey: instructions[0].childKey
            }),
            right: cache[instructions[1].child],
            leftKey: instructions[1].parentKey,
            rightKey: instructions[1].childKey
          }),
          fk: instructions[1].parentKey,
          pk: instructions[1].childKey,
          attributesToOmit: parentAttributeNames
        });

        console.log('joinedResults !!!!~ ',joinedResults,'\n\n');

        populate(
          results,
          alias,
          joinedResults,
          parentPK
        );


      }

      // 1..N Association
      else if ( instructions.length === 1 ) {
        
        joinedResults = leftOuterJoin({
          left: cache[instructions[0].parent],
          right: cache[instructions[0].child], 
          leftKey: instructions[0].parentKey,
          rightKey: instructions[0].childKey
        });

        joinedResults = _.map(joinedResults,function (result) {
          // Omit parent keys
          result = _.omit(result, parentAttributeNames);

          // Prune results with no child key
          // Replace child key with primary key of association
          
          return result;
        });


        populate(
          results,
          alias,
          joinedResults,
          parentPK
        );
      }

    }
  );


  // And call the callback
  // (the final joined data is in the cache -- also referenced by `results`)
  return cb(null, results);




/**
 * _sanitize
 *
 * Clean up the join rows injecting into final, populated
 * result set.
 *
 * @option {[Object]} rows
 * @option {String} fk - foreign key of association
 * @option {String} pk - associated primary key
 * @option {[String]} attributesToOmit
 *
 * NOTE: this could be modified to `attributesToInclude` rather than omit,
 * using the schema of the child collection.
 * 
 * @return {[Object]} sanitized rows
 */
function _sanitize (options) {

  var rows = options.rows;
  var fk = options.fk;
  var pk = options.pk;
  var attributesToOmit = options.attributesToOmit;

  return _.reduce(rows, function (memo, row) {

    // Ignore rows without an appropriate foreign key
    if (!row[fk]) return memo;
    
    var pkValue = row[fk];

    // Omit parent keys
    var sanitizedRow = {};
    sanitizedRow = _.omit(row, attributesToOmit);
    // Replace fk with associated pk
    delete sanitizedRow[fk];
    sanitizedRow[pk] = pkValue;


    memo.push(sanitizedRow);
    return memo;
  }, []);
}































  // // Now for each populate (i.e. alias), pop `instructions` until there's 
  // // only one left, performing the specified joins as destructive mutations
  // // on the data in the cache. 
  // _.each(populateInstructions, function ( instructions, alias ) {
  //   while (instructions.length > 1) {
  //     leftOuterJoin(instructions.pop());
  //   }    
  // });


  // Now that each association has only one join left, we can prepare for an
  // optimized final operation which will combine all of the remaining join
  // instructions into a single multi-join instruction.
  // 
  // We just need to build that join instruction:
  // var finalJoin = {
  //   parent: parent,
  //   parentKey: parentKey,
  //   joins: _.reduce(populateInstructions, function ( memo, instructions, alias ){

  //     // Ignore no-ops
  //     if (instructions.length < 1) return memo;

  //     // Build sub-join using child table and alias:
  //     memo.push({
  //       child: parent,
  //       childKey: parentKey,
  //       denormalizeInto: alias
  //     });
  //     return memo;
  //   }, [])
  // };

  // console.log('\n\nCACHE::',cache);

  // And then process it:
  // console.log('\n\nfinal join *******\n',finalJoin);
  // TODO

  // // And call the callback
  // // (the final joined data is in the cache)
  // return cb(null, cache[parent]);



  // For each instance of our calling Model (big daddy):
  // _.each(results, function (instance) {

  //   // For each relationship, add a key for the alias to our instance, calculating
  //   // its contents by reducing the list of join instructions into real data from 
  //   // the cache using left outer joins.
  //   // console.log(' * Populates: ', relationships);
  //   _.each(relationships, function (joins, alias) {


  //     // The first join's parent is always our "lefthand-side" table,
  //     // so we can safely start by cloning the current instance of "big daddy"
  //     // into a 1-cardinality array to represent this `initialDataSet`.
  //     var initialDataSet = [ _.cloneDeep(instance) ];

  //     // Go through and run each join in order
  //     instance[alias] = _.reduce(joins, function (leftRows, join) {

        
  //       // Already have the lefthand-side data (we're reducing it)
  //       // But we need to get the the data for the righthand-side
  //       // from the current join instruction:
  //       var rightTableName = join.child;
  //       var rightRows = cache[parentTable];

  //       var joinOptions = {
  //         left: leftRows,
  //         right: rightRows,
  //         leftKey: join.parentKey,
  //         rightKey: join.childKey
  //       };

  //       // console.log(' * Running a join on left rows ::\n', leftRows,'\nJoin options ::', joinOptions);

  //       // Return the result of a left outer join
  //       return leftOuterJoin(joinOptions);

  //     }, initialDataSet);
  //   });
    
  // });
};


