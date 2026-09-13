function define(script)
{
    script.Name = "action_flagCopy";
    script.Type = "ActionCustom";
    return 0;
}

// Copies the value of one flag into another or retrieve a context value
// and store it in a flag.
// - params[0]: Source key (or type)
// - params[1]: Destination key
// - params[2]: Source flag type: ZONE (default), INSTANCE,
//   CHARACTER, INSTANCE_CHARACTER, STATUS, STATUS_CHAR, STATUS_DEMON,
//   EVENT_COUNTER or WORLD_COUNTER
// - params[3]: Destination flag type: ZONE (default), INSTANCE,
//   CHARACTER or INSTANCE_CHARACTER
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null)
    {
        return Result_t.FAIL;
    }

    local sKey = params[0].tointeger();
    local dKey = params[1].tointeger();
    local sType = params.len() >= 3 ? params[2] : "ZONE";
    local dType = params.len() >= 4 ? params[3] : "ZONE";
    if(zone.GetZoneInstance() == null &&
        (sType == "INSTANCE" || sType == "INSTANCE_CHARACTER" ||
        dType == "INSTANCE" || dType == "INSTANCE_CHARACTER"))
    {
        return Result_t.FAIL;
    }
    else if(worldCID <= 0 &&
        (sType == "CHARACTER" || sType == "INSTANCE_CHARACTER" ||
        dType == "CHARACTER" || dType == "INSTANCE_CHARACTER" ||
        sType == "EVENT_COUNTER"))
    {
        return Result_t.FAIL;
    }

    local value = 0;
    if(sType == "STATUS" || sType == "STATUS_CHAR" || sType == "STATUS_DEMON")
    {
        local eState = null;
        if(sType == "STATUS")
        {
            eState = source;
        }
        else if(sType == "STATUS_CHAR")
        {
            eState = cState;
        }
        else
        {
            eState = dState;
        }

        if(eState == null)
        {
            return Result_t.FAIL;
        }

        foreach(status in eState.GetStatusEffects())
        {
            if(status.GetEffect() == sKey)
            {
                value += status.GetStack();
            }
        }
    }
    else if(sType == "ZONE" || sType == "CHARACTER")
    {
        value = zone.GetFlagState(sKey, 0, sType == "ZONE" ? 0 : worldCID);
    }
    else if(sType == "INSTANCE" || sType == "INSTANCE_CHARACTER")
    {
        value = zone.GetZoneInstance().GetFlagState(sKey, 0,
            sType == "INSTANCE" ? 0 : worldCID);
    }
    else if(sType == "EVENT_COUNTER")
    {
        local counter = cState.GetEventCounter(sKey, false);
        value = counter != null ? counter.GetCounter() : 0;
    }
    else if(sType == "WORLD_COUNTER")
    {
        local syncManager = server.GetChannelSyncManager();
        local counter = syncManager.GetWorldEventCounter(sKey);
        if(counter)
        {
            value = counter.GetCounter();
        }
        else
        {
            return Result_t.FAIL;
        }
    }
    else
    {
        return Result_t.FAIL;
    }

    if(dType == "ZONE" || dType == "CHARACTER")
    {
        zone.SetFlagState(dKey, value, dType == "ZONE" ? 0 : worldCID);
    }
    else if(dType == "INSTANCE" || dType == "INSTANCE_CHARACTER")
    {
        zone.GetZoneInstance().SetFlagState(dKey, value,
            dType == "INSTANCE" ? 0 : worldCID);
    }
    else
    {
        return Result_t.FAIL;
    }

    return Result_t.SUCCESS;
}