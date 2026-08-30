function define(script)
{
    script.Name = "oushin";
    script.Type = "WebApp";
    return 0;
}

function prepare(api, session, account, method, out)
{
    if(account.GetAPIOnly())
    {
        api.SetResponse(out, "error", "API Only accounts not supported");
        return -1;
    }

    return 0;
}

function answered(api, session, account, worldID, params, out)
{
    local promo = getPromo(api);
    if(!promo)
    {
        return 0;
    }

    local exchange = getPromoExchange(api, account, promo);
    api.SetResponse(out, "answered", exchange != null ? "1" : "0");

    return 0;
}

function answer(api, session, account, worldID, params, out)
{
    local answers = split(params["answers"], ",");
    if(answers.len() != 10)
    {
        api.SetResponse(out, "error", "Invalid answer count supplied");
        return 0;
    }

    local promo = getPromo(api);
    if(!promo)
    {
        return 0;
    }

    local exchange = getPromoExchange(api, account, promo);
    if(exchange != null)
    {
        api.SetResponse(out, "error", "Promo exchange already exists");
        return 0;
    }

    local productType = 1186;    // ジャックフロスト

    local allMatch = answers[0] == answers[1] &&
        answers[0] == answers[2] &&
        answers[0] == answers[3] &&
        answers[0] == answers[4] &&
        answers[0] == answers[5] &&
        answers[0] == answers[6] &&
        answers[0] == answers[7] &&
        answers[0] == answers[8] &&
        answers[0] == answers[9];
    if(allMatch && answers[0] == "1")
    {
        productType = 1183;    // コダマ
    }
    else if(allMatch && answers[0] == "3")
    {
        productType = 1190;    // スライム
    }
    else if(answers[0] == "2" &&
        answers[1] == "3" &&
        answers[2] == "3" &&
        answers[3] == "1" &&
        answers[4] == "1" &&
        answers[5] == "3" &&
        answers[6] == "2" &&
        answers[7] == "2" &&
        answers[8] == "2" &&
        answers[9] == "2")
    {
        productType = 1182;    // エンジェル
    }
    else if(answers[0] == "2" &&
        answers[1] == "3" &&
        answers[2] == "2" &&
        answers[3] == "2" &&
        answers[4] == "1" &&
        answers[5] == "2" &&
        answers[6] == "2" &&
        answers[7] == "2" &&
        answers[8] == "1" &&
        answers[9] == "1")
    {
        productType = 1189;    // オニ
    }
    else
    {
        // Check point total
        local pointMap = [
                [ 1, 0, -1],
                [ 1, -1, 0],
                [ 1, -1, 0],
                [ 1, -1, -2],
                [ -1, 0, 1],
                [ 2, -1, 1],
                [ 1, -1, -2],
                [ 1, 0, -1],
                [ 2, 1, -1],
                [ 1, -2, 0]
            ];

        local total = 0;
        for(local i = 0; i < 10; i++)
        {
            local answer = answers[i].tointeger();
            if(answer >= 1 && answer <= 3)
            {
                total += pointMap[i][answer - 1];
            }
        }

        if(total == 12)
        {
            productType = 1184;    // オンモラキ
        }
        else if(total == -12 ||
            allMatch && answers[0] == "2")
        {
            productType = 1188;    // キクリヒメ
        }
        else if(total > 3)
        {
            productType = 1185;    // ノズチ
        }
        else if(total < -3)
        {
            productType = 1187;    // バイコーン
        }
    }

    local t = api.GetTimestamp();

    local accountRef = AccountRef();
    accountRef.SetUUID(account.GetUUID());

    local post = PostItem();
    post.SetType(productType);
    post.SetAccount(accountRef);
    post.Source = PostItem_Source_t.EVENT;
    post.SetTimestamp(t);

    exchange = PromoExchange();
    exchange.SetPromo(promo.GetUUID());
    exchange.SetAccount(accountRef);
    exchange.SetTimestamp(t);

    local lobbyDB = api.GetLobbyDatabase();
    if(!PersistentObject.Register(post, UUID()) || !post.Insert(lobbyDB) ||
        !PersistentObject.Register(exchange, UUID()) || !exchange.Insert(lobbyDB))
    {
        productType = 0;

        api.SetResponse(out, "error", "Failed to add item to post.");
    }

    api.SetResponse(out, "result", productType.tostring());

    return 0;
}

function getPromo(api)
{
    local CODE = "OUSHIN";

    local lobbyDB = api.GetLobbyDatabase();

    local promos = Promo.LoadPromoListByCode(lobbyDB, CODE);
    if(promos.len() > 1)
    {
        print("Multiple " + CODE + " promos found. Please remove all but one.");
        return null;
    }
    else if(promos.len() == 0)
    {
        print("Creating " + CODE + " promo.");

        local promo = Promo();
        promo.SetCode(CODE);
        promo.SetUseLimit(1);
        promo.LimitType = Promo_LimitType_t.PER_ACCOUNT;

        // Start and end it now so it's not accessible in game
        local t = api.GetTimestamp();
        promo.SetStartTime(t);
        promo.SetEndTime(t);

        if(!PersistentObject.Register(promo, UUID()) || !promo.Insert(lobbyDB))
        {
            return null;
        }
        else
        {
            return promo;
        }
    }
    else
    {
        return promos[0];
    }
}

function getPromoExchange(api, account, promo)
{
    local lobbyDB = api.GetLobbyDatabase();
    local accountUUID = account.GetUUID().ToString();

    local exchanges = PromoExchange.LoadPromoExchangeListByPromo(lobbyDB,
        promo.GetUUID());
    foreach(exchange in exchanges)
    {
        if(exchange.GetAccount().GetUUID().ToString() == accountUUID)
        {
            return exchange;
        }
    }

    return null;
}