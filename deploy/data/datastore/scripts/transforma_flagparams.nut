function define(script)
{
    script.Name = "transforma_flagParams";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionRunScript command by setting the params based on flags
// - params[0]: Source flag type: ZONE, INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[1]+: Pairs of flag keys and param indexes to copy to
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 3 || (params.len() % 2) != 1 || zone == null ||
        (params[0] != "ZONE" && params[0] != "INSTANCE" &&
        params[0] != "CHARACTER" && params[0] != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(params[0] != "CHARACTER" && params[0] != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(params[0] == "ZONE" || params[0] == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return -1;
    }

    for(local i = 1; i < (params.len() - 1);)
    {
        local key = params[i].tointeger();
        local idx = params[i + 1].tointeger();
        local val = flagSource.GetFlagState(key, 0, worldCID);

        if((action.ParamsCount() - 1) < idx)
        {
            return -1;
        }
        else if((action.ParamsCount() - 1) == idx)
        {
            action.RemoveParams(idx);
            action.AppendParams(val.tostring());
        }
        else
        {
            action.RemoveParams(idx);
            action.InsertParams(idx, val.tostring());
        }

        i += 2;
    }

    return 0;
}