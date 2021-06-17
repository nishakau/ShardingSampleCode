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

/**
 * Create a new user entery into the database
 * 
 * @param {*} userDetails 
 */

exports.createNewUser = async function (userDetails) {
  let connection;
  let date = new Date();
  let temp = date.getDate()+""+(date.getMonth()+1)+""+date.getFullYear()+""+date.getHours()+""+date.getMinutes()+""+date.getMilliseconds();
  // let ID = uniquid.process(temp)
  let ID = temp;
  try {
    connection = await oracledb.getConnection();
    let ifUserExist = await userAlreadyInSystem(
      userDetails.EMAIL.toLowerCase(),
      connection
    );
    if (ifUserExist == CODE.USER_ALREDY_EXIST) {
      return CODE.USER_ALREDY_EXIST;
    }
    let dataToInsert = {
      USER_ID:ID,
      EMAIL: userDetails.EMAIL.toLowerCase(),
      PASSWORD: userDetails.PASSWORD,
    };
    let result = await connection.execute(
      `insert into CUSTOMER_AUTH(email,password,user_id) values (:EMAIL,:PASSWORD,:USER_ID)`,
      dataToInsert,
      { autoCommit: false }
    );
    // result = await connection.execute(
    //   `select user_id from CUSTOMER_AUTH where email = '${dataToInsert.EMAIL}'`,
    //   [],
    //   { outFormat: OUT_FORMAT_OBJECT }
    // );
    // let UserID = result.rows[0].USER_ID;
    let tempData = {
      USER_ID: ID,
      NAME: userDetails.NAME,
      PHONE: userDetails.PHONE.replace(/ /g, ""),
      ZIP: userDetails.ZIP,
      ADDRESS: userDetails.ADDRESS,
    };
    result = await connection.execute(
      `insert into CUSTOMER(user_id,name,phone,zip,address) values(:USER_ID,:NAME,:PHONE,:ZIP,:ADDRESS)`,
      tempData,
      { autoCommit: false }
    );

    await connection.commit();
    return CODE.NEW_USER;
  } catch (e) {
    if (connection) await connection.rollback();
    throw e;
  } finally {
    if (connection) await connection.close();
  }
};

/**
 * Method checks if the user with the sam email id already exists into the system.
 * 
 * @param {String} email 
 * @param {oracledb.Connection} con - default null
 */

async function userAlreadyInSystem(email, con = null) {
  let connection = con;
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select count(*) as count from CUSTOMER_AUTH where email='${email}'`,
      [],
      { outFormat: OUT_FORMAT_OBJECT }
    );
    if (result.rows[0].COUNT > 0) {
      return CODE.USER_ALREDY_EXIST;
    } else {
      return CODE.NEW_USER;
    }
  } catch (e) {
    Promise.reject(e);
  } finally {
    if (con == null && connection != null) await connection.close();
  }
}

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
 * 
 * @param {Object} match 
 * @param {oracledb.Connection} conn 
 * @returns brands
 */
async function getBrandsAndCount(match={}, conn= null){
  // console.log("reached db service");
  let connection = conn;
  try{
    if(connection == null) connection = await oracledb.getConnection();
    // console.log("connection fetched");
    let statement  = `select count(*) as bcount , p.json_text.MANUFACTURER from products p`;

    if(match.NAME != undefined){
      statement += ` where contains(json_text,'fuzzy((${match.NAME}))',1)>0`;
    }

    statement+= ` group by p.json_text.MANUFACTURER`;
    // console.log(statement);
    let result = await connection.execute(statement,[],{outFormat:OUT_FORMAT_OBJECT});
    // console.log(result.rows);
    return result.rows;
    
        

  }catch(e){
    return Promise.reject(e);
  }finally{
    if(connection != null && conn == null){
        await connection.close();
    }
  }
}

module.exports.getBrandsAndCount =getBrandsAndCount;
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
    // let reviews = await exports.getProductReviewByProductId(
    //   content.key,
    //   connection
    // );
    // content.reviews = reviews;
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

/**SODA ENDS HERE */


/**
 * Add items into the users cart
 * 
 * @param {String} productkey - Key of the product
 * @param {Number} userid - Id of the user
 */
exports.addProductToCart = async function (productkey, userid) {
  let connection;
  try {
    let tempObj = { USER_ID: userid, PRODUCT_ID: productkey };
    connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select count(*) as count from cart where user_id=:USER_ID and product_id=:PRODUCT_ID`,
      tempObj,
      { outFormat: OUT_FORMAT_OBJECT }
    );
    if (result.rows[0].COUNT > 0) {
      await connection.execute(
        `update cart set quantity=QUANTITY +1 where user_id=:USER_ID and product_id=:PRODUCT_ID`,
        tempObj,
        { outFormat: OUT_FORMAT_OBJECT }
      );
    } else {
      tempObj.QUANTITY = 1;
      await connection.execute(
        `insert into cart(USER_ID,PRODUCT_ID,QUANTITY) values(:USER_ID,:PRODUCT_ID,:QUANTITY)`,
        tempObj,
        { outFormat: OUT_FORMAT_OBJECT }
      );
    }
    await connection.commit();
    const data = await exports.getCartDetails(userid);
    return data;
  } catch (e) {
    throw e;
  } finally {
    if (connection) await connection.close();
  }
};


/**
 * Get the details of the user's cart
 * 
 * @param {Number} user_id 
 * @param {oracledb.Connection} conn 
 */
exports.getCartDetails = async function (user_id, conn = null) {
  let connection = conn;
  try {
    let cartData = new Array();
    if (connection == null) connection = await oracledb.getConnection();
    let soda = connection.getSodaDatabase();
    const collection = await soda.openCollection("PRODUCTS");
    let result = await connection.execute(
      `select product_id ,quantity from cart where user_id=:USER_ID`,
      { USER_ID: user_id },
      { outFormat: OUT_FORMAT_OBJECT }
    );

    for (let i = 0; i < result.rows.length; i++) {
      const doc = await collection
        .find()
        .key(result.rows[i].PRODUCT_ID)
        .getOne();
      const content = doc.getContent();
      content.key = doc.key;
      content.quantity = result.rows[i].QUANTITY;
      content.MAX = await checkStock(content.key,connection);
      if(content.MAX < 1){
        continue;
      }

      cartData.push(content);
    }
    return cartData;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) {
      await connection.close();
    }
  }
};

/**
 * Deletes the product from the user cart
 * 
 * @param {String} productkey 
 * @param {Number} userid 
 */
exports.deleteProductFromCart = async function (productkey, userid) {
  let connection;
  try {
    let tempObj = { USER_ID: userid, PRODUCT_ID: productkey };
    connection = await oracledb.getConnection();
    await connection.execute(
      `delete from cart where user_id=:USER_ID and product_id=:PRODUCT_ID`,
      tempObj,
      { outFormat: OUT_FORMAT_OBJECT }
    );

    await connection.commit();
  } catch (e) {
    throw e;
  } finally {
    if (connection) await connection.close();
  }
};


/**
 * Update the cart on quantity change
 * 
 * @param {String} productkey 
 * @param {Number} userid 
 * @param {Number} quantity 
 */
exports.updateCart = async function (productkey, userid, quantity) {
  let connection;

  try {
    let tempObj = {
      QUANTITY: quantity,
      USER_ID: userid,
      PRODUCT_ID: productkey,
    };
    connection = await oracledb.getConnection();
    await connection.execute(
      `update cart set quantity=:QUANTITY where user_id=:USER_ID and product_id=:PRODUCT_ID`,
      tempObj,
      { outFormat: OUT_FORMAT_OBJECT, autoCommit: true }
    );

    return true;
  } catch (e) {
    throw e;
  } finally {
    if (connection) await connection.close();
  }
};


/**
 * Populate the LINE_ITEM table when user finally places the order
 * 
 * @param {String} address 
 * @param {Number} userid 
 */
exports.placeOrder = async function (address, userid) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    let cartData = await exports.getCartDetails(userid, connection);
    let temp = "OD" + userid + Date.now();
    let ID = uniquid.process(temp)
    let arrayList = new Array();
    for (let i = 0; i < cartData.length; i++) {
      
      let orderObject = {
        USER_ID: userid,
        ADDRESS: address.address,
        PHONE: address.phone,
        ZIP: address.zip,
        ISDELIVERED: "false",
        ORDER_STATUS: "Placed",
        INTRANSITCOMMENTS: "",
        DATE_ORDERED: new Date(),
        ORDER_ID: ID,
        PRODUCT_ID: cartData[i].key,
        PRODUCT_NAME: cartData[i].NAME,
        PRODUCT_IMAGE: cartData[i].THUMBNAILIMAGE,
        PRODUCT_COST: cartData[i].SALEPRICE || 20,
        PRODUCT_QUANTITY: cartData[i].quantity,
      };

      arrayList.push(orderObject);

      await updateStock(orderObject.PRODUCT_ID,parseInt(orderObject.PRODUCT_QUANTITY),connection);
    }

    if(arrayList.length >0) {
      let tempData = arrayList[0];
      await insertIntoOrderTable({ORDER_ID:tempData.ORDER_ID,ORDER_DATE:tempData.DATE_ORDERED,ORDER_STATUS:tempData.ORDER_STATUS,ORDEREDBY_CUSTOMER_ID:tempData.USER_ID},connection);
    }

    for(let x=0;x<arrayList.length;x++){
      await connection.execute(
        `insert into LINE_ITEM(ORDER_ID,USER_ID,ADDRESS,PHONE,ZIP,PRODUCT_ID,PRODUCT_NAME,PRODUCT_IMAGE,PRODUCT_COST,PRODUCT_QUANTITY,ORDER_STATUS,ISDELIVERED,INTRANSITCOMMENTS,DATE_ORDERED) values(:ORDER_ID,:USER_ID,:ADDRESS,:PHONE,:ZIP,:PRODUCT_ID,:PRODUCT_NAME,:PRODUCT_IMAGE,:PRODUCT_COST,:PRODUCT_QUANTITY,:ORDER_STATUS,:ISDELIVERED,:INTRANSITCOMMENTS,:DATE_ORDERED)`,
        arrayList[x],
        {
          outFormat: OUT_FORMAT_OBJECT,
          autoCommit: false,
        }
      );


    }
   
    await clearUserCart(userid, connection);
    await connection.commit();
  } catch (e) {
    if(connection) await connection.rollback();
    console.log(e);
    throw e;
  } finally {
    if (connection) await connection.close();
  }
};


async function insertIntoOrderTable(data, con = null){
  let connection = con;
  try{
    if(connection == null) connection = await oracledb.getConnection();
    let statement = `insert into ORDERS(ORDER_ID,ORDER_DATE,ORDER_STATUS,ORDEREDBY_CUSTOMER_ID)
    values(:ORDER_ID,:ORDER_DATE,:ORDER_STATUS,:ORDEREDBY_CUSTOMER_ID)`;
    await connection.execute(statement,data,{autoCommit:false});
  }catch(e){
    console.log(e);
    return Promise.reject(e);
  }finally{
    if(connection != null && con == null) await connection.close();
  }
}

/**
 * Clears the cart for the user
 * 
 * @param {Number} userid 
 * @param {oracledb.Connection} conn 
 */
async function clearUserCart(userid, conn = null) {
  let connection = conn;
  let obj = { USER_ID: userid };
  try {
    if (connection == null) connection = await oracledb.getConnection();
    await connection.execute("delete from cart where user_id=:USER_ID", obj, {
      outFormat: OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
  } catch (e) {
    throw e;
  } finally {
    if (conn == null && connection != null) await connection.close();
  }
}

/**
 * Returns the date as a string in DD-MM-YYYY format
 * 
 * @param {Date} date 
 */
function getDateString(date) {

  let month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (
    date.getDate() + "-" + month[date.getMonth()]+ "-" + date.getFullYear()
  );
}


/**
 * Get the information about the user
 * 
 * @param {Number} userid 
 * @param {oracledb.Connection} conn 
 */
exports.getUserInfoById = async function getUserInfoById(userid, conn = null) {
  let connection = conn;
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select * from CUSTOMER where user_id=:USER_ID`,
      { USER_ID: userid },
      { outFormat: OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) await connection.close();
  }
};


/**
 * Returns placed order details to a user along with the reviews
 * 
 * @param {Number} userid 
 * @param {oracledb.Connection} conn 
 */
exports.myorders = async function myorders(userid, conn = null, isdel = null) {
  let connection = conn;
  try {
    if (connection == null) connection = await oracledb.getConnection();

    let statement = `select ORDER_ID,USER_ID,ADDRESS,PHONE,ZIP,PRODUCT_ID,PRODUCT_NAME,PRODUCT_IMAGE,PRODUCT_COST,PRODUCT_QUANTITY,ORDER_STATUS,ISDELIVERED,INTRANSITCOMMENTS,to_char(DATE_ORDERED,'dd-mon-yy') as DATE_ORDERED from LINE_ITEM where USER_ID=:USER_ID`;
    if(isdel != null){
      statement += ` and ISDELIVERED= '${isdel}'`;
    }
    statement += ` order by DATE_ORDERED desc`;

    // console.log(statement);
    let result = await connection.execute(statement,
      { USER_ID: userid },
      { outFormat: OUT_FORMAT_OBJECT }
    );
    let productReview = await getProductReviewByUser(userid, connection);
    result.rows.forEach((x) => {
      let tempProduct = productReview.filter(
        (t) => t.PRODUCT_ID == x.PRODUCT_ID && t.ORDER_ID == x.ORDER_ID
      )[0] || { TITLE: null, REVIEW: null };

      x.TITLE = tempProduct.TITLE;
      x.REVIEW = tempProduct.REVIEW;
      x.RATING = tempProduct.RATING;
    });
    return result.rows;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) await connection.close();
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
/*exports.addreview_old = async function addreview(
  userid,
  product_id,
  review,
  title,
  order_id,
  rating = 0,
  conn = null
) {
  let temp = "REV" + userid;
  let connection = conn;
  let tempdata = {
    USER_ID: userid,
    PRODUCT_ID: product_id,
    REVIEW: review,
    TITLE: title,
    DATE_RATED: new Date(),
    ORDER_ID: order_id,
    RATING: rating,
    ID:uniquid.process(temp)
  };
  
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let userInfo = await exports.getUserInfoById(userid, connection);
    tempdata.USER_NAME = userInfo.NAME;

    let key = tempdata.ID;
    await connection.execute(
      `insert into review(USER_ID,REVIEW,TITLE,DATE_RATED,PRODUCT_ID,ORDER_ID,USER_NAME,RATING,ID) values (:USER_ID,:REVIEW,:TITLE,:DATE_RATED,:PRODUCT_ID,:ORDER_ID,:USER_NAME,:RATING,:ID)`,
      tempdata,
      { outFormat: OUT_FORMAT_OBJECT, autoCommit: false }
    );

    
    if (rating != 0) {
      const soda = connection.getSodaDatabase();
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
    updateSentimentScore(key);
    

    return;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) await connection.close();
  }
};*/

/**
 * Get all the reviews done by a user mapped along with product
 * 
 * @param {Number} userid 
 * @param {oracledb.Connection} conn 
 */
async function getProductReviewByUser(userid, conn = null) {
  let connection = conn;
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select rj.json_text.TITLE,rj.json_text.REVIEW,rj.json_text.DATE_RATED,rj.json_text.USER_NAME,rj.json_text.USER_ID,rj.json_text.PRODUCT_ID,rj.json_text.ORDER_ID,rj.json_text.RATING from REVIEWS rj where rj.json_text.USER_ID=:USER_ID`,
      { USER_ID: userid },
      { outFormat: OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) {
      await connection.close();
    }
  }
}

/**
 * Returns user reviews for a given product
 * 
 * @param {Number} userid 
 * @param {oracledb.Connection} conn 
 */
exports.getProductReviews = async function getProductReviews(
  userid,
  conn = null
) {
  let connection = conn;
  try {
    if (connection == null) connection = await oracledb.getConnection();
    let result = await connection.execute(
      `select rj.json_text.TITLE,rj.json_text.REVIEW,rj.json_text.DATE_RATED,rj.json_text.USER_NAME,rj.json_text.USER_ID,rj.json_text.PRODUCT_ID,rj.json_text.ORDER_ID from REVIEWS where rj.json_text.USER_ID=:USER_ID`,
      { USER_ID: userid },
      { outFormat: OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) {
      await connection.close();
    }
  }
};


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

    // let key = tempdata.ID;
    // await connection.execute(
    //   `insert into review(USER_ID,REVIEW,TITLE,DATE_RATED,PRODUCT_ID,ORDER_ID,USER_NAME,RATING,ID) values (:USER_ID,:REVIEW,:TITLE,:DATE_RATED,:PRODUCT_ID,:ORDER_ID,:USER_NAME,:RATING,:ID)`,
    //   tempdata,
    //   { outFormat: OUT_FORMAT_OBJECT, autoCommit: false }
    // );
    const soda = connection.getSodaDatabase();
    // const collection = await soda.openCollection("REVIEWS");
    // const document = await collection.insertOneAndGet(tempdata);

    let statement = `insert into REVIEWS(REVID,JSON_TEXT,SKU) values('${REVID}','${stringifiedObject}','${tempdata.PRODUCT_ID}')`;

    await connection.execute(statement,[],{autoCommit:false});
    
    let key = REVID;
    if (rating != 0) {
      // const soda = connection.getSodaDatabase();
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
    // await connection.execute('update REVIEWS set SKU=:SKU where REVID=:KEY',{SKU:tempdata.PRODUCT_ID,KEY:key},{outFormat:OUT_FORMAT_OBJECT});
    await connection.commit();
    updateSentimentScore(key,tempdata);
  

    return;
  } catch (e) {
    throw e;
  } finally {
    if (connection != null && conn == null) await connection.close();
  }
};


async function checkStock(product_id,con=null){

 
    let connection = con;
    try{
      if(connection == null ) connection = await oracledb.getConnection();
      let statement = `select product_count as count from inventory where PRODUCT_ID=:PRODUCT_ID`;
      let result = await connection.execute(statement,{PRODUCT_ID:product_id},{outFormat:OUT_FORMAT_OBJECT});
      if(result.rows.length>0)
      return result.rows[0].COUNT;
      else
      return 0;
  
    }catch(e){
      return Promise.reject(e);
    }finally{
      if(connection != null && con == null){
        await connection.close();
      }
    }
  

}


async function updateStock(product_id,soldcount,con=null){
  let connection = con;
  try{
    if(connection == null ) connection = await oracledb.getConnection();
    let statement = `update inventory set product_count =( product_count - :SOLD_COUNT) where PRODUCT_ID=:PRODUCT_ID`;
    await connection.execute(statement,{SOLD_COUNT:soldcount,PRODUCT_ID:product_id},{outFormat:OUT_FORMAT_OBJECT,autoCommit:false});
    return;

  }catch(e){
    return Promise.reject(e);
  }finally{
    if(connection != null && con == null){
      await connection.close();
    }
  }


}

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
 * Updates the status of orders placed
 */
cron.schedule("0 37 22 * * *",updateOrderStatus);
async function updateOrderStatus(){
  let connection = null;
  try{
    connection = await oracledb.getConnection();
    await connection.execute(`update line_item set order_status= 'Delivered', ISDELIVERED = 'true' where order_status='OFD'`,[],{autoCommit:true});
    await connection.execute(`update line_item set order_status= 'OFD' where order_status='Shipped'`,[],{autoCommit:true});
    await connection.execute(`update line_item set order_status= 'Shipped' where order_status='Placed'`,[],{autoCommit:true});
    
  }catch(e){
    throw e;
  }finally{
    if(connection != null )await connection.close();
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