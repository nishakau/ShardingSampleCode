module.exports = {
     sharding: {
        user: 'SHARDUSERTEST',
        password: 'oracle',
        connectString: '158.101.120.251:1521/catpdb.sub10041039132.dbseclabvcn.oraclevcn.com',
        poolMin: 10,
        poolMax: 10,
        poolIncrement: 0
    },
    /*sharding: {
        user: 'SHARDUSERTEST',
        password: 'oracle',
        connectString: '158.101.120.251:1522/oltp_rw_srvc.orasdb.oradbcloud',
        poolMin: 10,
        poolMax: 10,
        poolIncrement: 0
    },*/
    //Metadata for the PRODUCTS collection
    metadata : {
        "keyColumn": {
            "name":"SKU"
        },
        "contentColumn": {
            "name": "JSON_TEXT",
            "sqlType": "CLOB"
        }
    },
    metadataReview:{
        "keyColumn":{
            "name":"REVID"
        },
        "contentColumn":{
            "name":"JSON_TEXT",
            "sqlType":"CLOB"
        }

    }
  

}
