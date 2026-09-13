function define(script)
{
    script.Name = "action_eventCounter";
    script.Type = "ActionCustom";
    return 0;
}

// Create/Modify an event counter
// - params[0]: event counter ID
// - params[1]: value to change/set counter by
// - params[2]: counter should be decreased if 1, set to params[1] if 2, flag
//   mask (add) if 3, floored at value if 4
// - params[3]: Option flags, if 1 set the world counter instead, if 2 set
//   current clan on RelatedTo field, if 4 retrieve value from zone character
//   flag matching param 1 instead
function run(source, cState, dState, zone, server, params)
{
    local syncManager = server.GetChannelSyncManager();
    local worldDB = server.GetWorldDatabase();

    local eCounter = null;
    local characterUID = null;
    local counterValue = params.len() >= 2 ? params[1].tointeger() : 1;

    if(params.len() >= 4 && (params[3].tointeger() & 4) != 0)
    {
        if(cState == null || zone == null)
        {
            return Result_t.FAIL;
        }

        counterValue = zone.GetFlagState(counterValue, 0, cState.GetWorldCID());
    }

    if(params.len() >= 4 && (params[3].tointeger() & 1) != 0)
    {
        // Use world counter
        eCounter = syncManager.GetWorldEventCounter(params[0].tointeger());
        characterUID = UUID();
    }
    else
    {
        // Use character counter
        local character = cState != null ? cState.GetEntity() : null;
        if(character == null)
        {
            return Result_t.FAIL;
        }
    
        eCounter = cState.GetEventCounter(params[0].tointeger(), true);

        characterUID = character.GetUUID();
    }

    if(params.len() == 3)
    {
        if(params[2].tointeger() == 1)
        {
            // Decrease
            counterValue = counterValue * -1;
        }
        else if(params[2].tointeger() == 3)
        {
            // Flag mask (add)
            counterValue = 1 << counterValue;
        }
    }

    local relatedTo = eCounter != null ? eCounter.GetRelatedTo() : UUID();
    if(params.len() >= 4 && (params[3].tointeger() & 2) != 0)
    {
        local character = cState != null ? cState.GetEntity() : null;
        local clan = character != null ? character.GetClan().Get() : null;
        if(clan != null)
        {
            relatedTo = clan.GetUUID();
        }
    }

    if(!eCounter || eCounter.GetUUID().IsNull())
    {
        if(!eCounter)
        {
            eCounter = EventCounter();
            eCounter.SetCharacter(characterUID);
            eCounter.SetType(params[0].tointeger());
        }

        eCounter.SetCounter(counterValue);
        eCounter.SetRelatedTo(relatedTo);

        if(!PersistentObject.Register(eCounter, UUID()) || !eCounter.Insert(worldDB))
        {
            return Result_t.FAIL;
        }
    }
    else
    {
        if(params.len() == 3 && params[2].tointeger() == 2)
        {
            // Setting
        }
        else if(params.len() == 3 && params[2].tointeger() == 3)
        {
            // Flag mask (add)
            counterValue = eCounter.GetCounter() | counterValue;
        }
        else if(params.len() == 3 && params[2].tointeger() == 4)
        {
            // Flooring
            counterValue = eCounter.GetCounter() > counterValue
                ? eCounter.GetCounter() : counterValue;
        }
        else
        {
            // Adding
            counterValue = eCounter.GetCounter() + counterValue;
        }

        if(eCounter.GetCounter() == counterValue &&
            eCounter.GetRelatedTo() == relatedTo)
        {
            // Nothing to do
            return Result_t.SUCCESS;
        }

        eCounter.SetCounter(counterValue);
        eCounter.SetRelatedTo(relatedTo);

        if(!eCounter.Update(worldDB))
        {
            return Result_t.FAIL;
        }
    }

    syncManager.UpdateRecord(eCounter, "EventCounter");
    syncManager.SyncOutgoing();

    return Result_t.SUCCESS;
}