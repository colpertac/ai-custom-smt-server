function define(script)
{
    script.Name = "transforma_statusMultiply";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionAddRemoveStatus command by multiplying the stack count on
// each status being added based on a zone flag key
// - params[0]: Zone flag key with stack count multiplier
// - params[1]: ZONE (default), INSTANCE, CHARACTER or INSTANCE_CHARACTER
function transform(source, cState, dState, zone, params)
{
    if(zone == null || params.len() < 1)
    {
        return -1;
    }

    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    local type = params.len() >= 2 ? params[1] : "ZONE";
    if(type != "ZONE" && type != "INSTANCE" && type != "CHARACTER" &&
        type != "INSTANCE_CHARACTER")
    {
        return Result_t.FAIL;
    }
    else if(type == "CHARACTER" || type == "INSTANCE_CHARACTER")
    {
        if(worldCID <= 0)
        {
            return Result_t.FAIL;
        }
    }
    else
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(type == "ZONE" || type == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return Result_t.FAIL;
    }

    local multiplier = flagSource.GetFlagState(params[0].tointeger(), 0, worldCID);
    foreach(key in action.GetStatusStacksKeys())
    {
        action.SetStatusStacksEntry(key,
            action.GetStatusStacksByKey(key) * multiplier);
    }

    return 0;
}