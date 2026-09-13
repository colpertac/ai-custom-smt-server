function define(script)
{
    script.Name = "action_postItem";
    script.Type = "ActionCustom";
    return 0;
}

// Send an item to a character's post.
// - params[0]: Shop productID
// - params[1]: Message ID
// - params[2]: Optional source type (from enum)
function run(source, cState, dState, zone, server, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null || params.len() < 1)
    {
        return Result_t.FAIL;
    }

    local syncManager = server.GetChannelSyncManager();
    local lobbyDB = server.GetLobbyDatabase();
    local clock = server.GetWorldClockTime();

    local accountRef = AccountRef();
    accountRef.SetUUID(character.GetAccount());

    local post = PostItem();
    post.SetAccount(accountRef);
    post.SetTimestamp(clock.SystemTime);
    if(params.len() >= 2)
    {
        post.SetDistributionMessageID(params[1].tointeger());
    }

    post.SetType(params[0].tointeger());

    if(params.len() >= 3)
    {
        if(params[2] == "EVENT")
        {
            post.Source = PostItem_Source_t.EVENT;
        }
        else if(params[2] == "COMPENSATION")
        {
            post.Source = PostItem_Source_t.COMPENSATION;
        }
        else if(params[2] == "CAMPAIGN")
        {
            post.Source = PostItem_Source_t.CAMPAIGN;
        }
        else if(params[2] == "RECURRING")
        {
            post.Source = PostItem_Source_t.RECURRING;
        }
        else if(params[2] == "PROMOTION")
        {
            post.Source = PostItem_Source_t.PROMOTION;
        }
        else if(params[2] == "GIFT")
        {
            post.Source = PostItem_Source_t.GIFT;
        }
    }

    if(!PersistentObject.Register(post, UUID()) || !post.Insert(lobbyDB))
    {
        return Result_t.FAIL;
    }

    return Result_t.SUCCESS;
}