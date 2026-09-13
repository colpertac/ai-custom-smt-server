function define(script)
{
    script.Name = "action_flagValueToKey";
    script.Type = "ActionCustom";
    return 0;
}

// Uses flag value from specified key as destination key to be set to 1.
// - params[0]: Source flag key
// - params[1]: Source flag type: ZONE (default), INSTANCE,
//   CHARACTER or INSTANCE_CHARACTER
// - params[2]: Destination flag sType: ZONE (default), INSTANCE,
//   CHARACTER or INSTANCE_CHARACTER
// - params[3]: Destination flag value.
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null)
    {
        return Result_t.FAIL;
    }

    local sType = params.len() >= 2 ? params[1] : "ZONE";
    local dType = params.len() >= 3 ? params[2] : "ZONE";
    if(zone.GetZoneInstance() == null &&
        (sType == "INSTANCE" || sType == "INSTANCE_CHARACTER"||
        dType == "INSTANCE" || dType == "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(worldCID <= 0 &&
        (sType == "CHARACTER" || sType == "INSTANCE_CHARACTER"||
        dType == "CHARACTER" || dType == "INSTANCE_CHARACTER"))
    {
        return Result_t.FAIL;
    }

    local inKey = params[0].tointeger();
    local outValue = params.len() >= 4 ? params[3].tointeger() : 1;
    if(sType == "ZONE" || sType == "CHARACTER")
    {
        local value = zone.GetFlagState(inKey, outValue, sType == "ZONE" ? 0 : worldCID);
        zone.SetFlagState(value, outValue, dType == "ZONE" ? 0 : worldCID);
    }
    else if(sType == "INSTANCE" || sType == "INSTANCE_CHARACTER")
    {
        local value = zone.GetZoneInstance().GetFlagState(inKey, outValue, sType == "INSTANCE" ? 0 : worldCID);
        zone.GetZoneInstance().SetFlagState(value, outValue,
            dType == "INSTANCE" ? 0 : worldCID);
    }
    else
    {
        return Result_t.FAIL;
    }

    return Result_t.SUCCESS;
}