/**
 * database.service
 * This is the module which contains all the functions that may require access to  database.
 * The functionality in this module is exposed using named export so as to be imported in different.
 *
 */
const { OUT_FORMAT_OBJECT, connectionClass, STMT_TYPE_DROP } = require("oracledb");
const oracledb = require("oracledb");
const oracleConfig = require("../config/database.config");
const CODE = require("../config/message.code").messageCode;
const uniquid = require("uniqid");
const cron = require("node-cron");

/**
 * Initializing the database module, creating the connection pool using the details provided in
 * databsae confifuration file.
 */
async function initialize() {
  const pool = await oracledb.createPool(oracleConfig.sharding);
  oracledb.dbObjectAsPojo = true;
}

module.exports.initialize = initialize;

/**
 * Closing the connection pool
 */
async function close() {
  await oracledb.getPool().close();
}

module.exports.close = close;

/**
 * Validate user login based on user email and password
 * AuthenticateUserCredentials accepts email and password as paramters,
 * Search for any rows that satisifies the combination and perform diffent functionality based on the return condition
 **/

async function AuthenticateUserCredentials(email, password) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select user_id,password from CUSTOMER_AUTH where email ='${email}'`,
      [],
      { outFormat: OUT_FORMAT_OBJECT }
    );
    if (result.rows.length > 0) {
      if (result.rows[0].PASSWORD == password) {
        return Promise.resolve(result.rows[0].USER_ID);
      } else {
        return Promise.reject(CODE.USER_WRONG_PASSWORD);
      }
    } else {
      return Promise.reject(CODE.USER_WRONG_EMAIL);
    }
  } catch (e) {
    return Promise.reject(e);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

module.exports.AuthenticateUserCredentials = AuthenticateUserCredentials;

/**
 * Return information of the user for the provided user id
 * 
 * @param {Number} user_id This is the numeric id attached to each user when the signup into the system.
 */

exports.getUserInfo = async function (user_id) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select * from CUSTOMER where user_id='${user_id}'`,
      [],
      { outFormat: OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } catch (e) {
    Promise.reject("Error fetching user info");
  } finally {
    if (connection) await connection.close();
  }
};

//**SODA FUNCTIONS HERE */

/**
 * Return product list
 * 
 * @param {Number} pageNumber - For the pagination logic
 * @param {Object} queryObject - Filter condition.
 */

async function returnProducts(pageNumber, queryObject) {
  let connection;
  let startRow = pageNumber;
  let limit = 12;
  try {
    let match = { $query: queryObject, $orderby: { NAME: 1 } };
   
    // console.log(match.$query.NAME.$contains);
    connection = await oracledb.getConnection();
    const soda = connection.getSodaDatabase();
    const collection = await soda.openCollection("PRODUCTS");
    const doc = await collection
      .find()
      .filter(match)
      .skip(startRow)
      .limit(limit)
      .getDocuments();
    let array = new Array();
    doc.forEach(function (element) {
      const content = element.getContent();
      content.key = element.key;
      array.push(content);
    });
    const totalCount = await collection.find().filter(match).count();

    let tempResult = { list: array, count: totalCount.count };
    return tempResult;
  } catch (e) {
    throw e;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.log("Error in closing connection:\n", err);
      }
    }
  }
}

module.exports.returnProducts = returnProducts;


/**
 * Returns the details of the prodcut with its product id
 * 
 * @param {String} id - Id of the product
 */
async function getProductByKey(id) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const soda = connection.getSodaDatabase();
    const collection = await soda.openCollection("PRODUCTS");
    const doc = await collection.find().key(id).getOne();
    const content = doc.getContent();
    content.key = doc.key;
    content.COUNT = await checkStock(content.key,connection);
    return content;
  } catch (e) {
    throw e;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.log("Error closing connection");
      }
    }
  }
}
module.exports.getProductByKey = getProductByKey;



/**
 * Returns reviews for a given product
 * 
 * @param {String} product_id 
 * @param {Object} filteroption 
 * @param {oracledb.Connection} conn 
 */
exports.getProductReviewByProductId = async function getProductReviewByProductId(
  queryObject={},pageNumber,conn = null,
) {
  let connection = conn;
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let soda = connection.getSodaDatabase();
    let collection = await soda.openCollection("REVIEWS");
    let match = { $query: queryObject,$orderby:{SENTI_SCORE: -1 }};
    let resultArray = new Array();
    (await collection.find().filter(match).skip(pageNumber*10).limit(10).getDocuments()).forEach(x=>{
      resultArray.push(x.getContent());
    });
    
    
    return resultArray;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) {
      await connection.close();
    }
  }
};


/**
 * TypeAhead suggestion for the user
 * 
 * @param {String} keys - String pattern 
 */
exports.getSuggestion = async (keys) => {
  let connection;
  try {
    connection = await oracledb.getConnection();
    let stmt = `select p.json_text.NAME from PRODUCTS p where contains(json_text, 'fuzzy((${keys}))', 1) > 0 order by score(1) desc`;
    let result = await connection.execute(stmt, [], {
      outFormat: OUT_FORMAT_OBJECT,
    });
    let arr = new Array();
    for (let i = 0; i < result.rows.length && i < 6; i++) {
      arr.push(result.rows[i].NAME);
    }
    return arr;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    if (connection) await connection.close();
  }
};








/**
 * Record the user review for a product into the review table
 * 
 * @param {Number} userid 
 * @param {String} product_id 
 * @param {String} review 
 * @param {String} title 
 * @param {String} order_id 
 * @param {Number} rating 
 * @param {oracledb.Connection} conn 
 */
exports.addreview = async function addreview(
  userid,
  product_id,
  review,
  title,
  order_id,
  rating = 0,
  conn = null
) {

  let date = new Date();
  let REVID = "REV" + userid +''+date.getDate()+''+date.getMonth()+''+date.getFullYear()+''+date.getHours()+''+date.getSeconds()+''+date.getMilliseconds();
  let connection = conn;
  let tempdata = {
    USER_ID: userid,
    PRODUCT_ID: product_id,
    REVIEW: review,
    TITLE: title,
    DATE_RATED: getDateString(new Date()),
    ORDER_ID: order_id,
    RATING: rating,
    SENTI_SCORE:null
    // ID:uniquid.process(temp)
  };
  
  let stringifiedObject = JSON.stringify(tempdata);

  try {
    if (connection == null) connection = await oracledb.getConnection();
    let userInfo = await exports.getUserInfoById(userid, connection);
    tempdata.USER_NAME = userInfo.NAME;

    const soda = connection.getSodaDatabase();

    let statement = `insert into REVIEWS(REVID,JSON_TEXT,SKU) values('${REVID}','${stringifiedObject}','${tempdata.PRODUCT_ID}')`;

    await connection.execute(statement,[],{autoCommit:false});
    
    let key = REVID;
    if (rating != 0) {
      const collection = await soda.openCollection("PRODUCTS");
      const item = await collection.find().key(product_id).getOne();
      let doc = item.getContent();
      let sum =
        doc.CUSTOMERREVIEWCOUNT * doc.CUSTOMERREVIEWAVERAGE + parseInt(rating);
      let newAverageRating = sum / (parseInt(doc.CUSTOMERREVIEWCOUNT) + 1);
      doc.CUSTOMERREVIEWCOUNT++;
      doc.CUSTOMERREVIEWAVERAGE = Math.ceil(
        parseFloat(newAverageRating).toFixed(2)
      );
      await collection.find().key(product_id).replaceOne(doc);
    }
       await connection.commit();
    updateSentimentScore(key,tempdata);
  

    return;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) await connection.close();
  }
};




/**
 * Return top five tredning product in the store
 */
exports.getFiveTrendingProducts = async function getFiveTrendingProducts(){
  let connection= null;
  try{
    connection = await oracledb.getConnection();
    let statement = `with abc as(select count(*) orderedcount, product_id from line_item where DATE_ORDERED> sysdate-60 group by product_id order by orderedcount desc),topfive as (select * from abc where rownum <7) select p.json_text.THUMBNAILIMAGE,p.json_text.NAME,SKU,p.json_text.SALEPRICE,p.json_text.MANUFACTURER from products p where SKU in(select product_id from topfive)`;

    let result = await connection.execute(statement,[],{outFormat:OUT_FORMAT_OBJECT});
    return Promise.resolve(result.rows);

  }catch(e){
    return Promise.reject(e);
  }finally{
    if(connection != null)
      await connection.close();
  }
}




/**
 * Calculate the sentiment score for the review in review table.
 * 
 * @param {String} ID - Review Id
 */
 async function updateSentimentScore(ID,docmt){
  let connection = null;
  try{
 
   connection = await oracledb.getConnection({
    user: 'SHARDUSERTEST',
    password: 'oracle',
    connectString: '158.101.120.251:1522/oltp_rw_products.orasdb.oradbcloud',
    shardingKey:[docmt.PRODUCT_ID]
    });
  
    let sqlStatement = `select ctx_doc.sentiment_aggregate('REVIEWS2_TEXT_INDEX',ctx_doc.pkencode(sys_hashval, sku, '${ID}')) as Score from REVIEWS where REVID='${ID}'`;
    let result = await connection.execute(sqlStatement,[],{outFormat:OUT_FORMAT_OBJECT});
    docmt.SENTI_SCORE = result.rows[0].SCORE;
    await connection.execute(`update REVIEWS set senti_score = ${docmt.SENTI_SCORE} where revid= '${ID}'`)
    let soda = connection.getSodaDatabase();
    let collection = await soda.openCollection('REVIEWS');
    await collection.find().key(ID).replaceOne(docmt);
    await connection.commit();


  }catch(e){
    console.log("Error Ocuured while updating sentiment");
    throw e;
  }finally{
    if(connection != null) await connection.close();
  }
}