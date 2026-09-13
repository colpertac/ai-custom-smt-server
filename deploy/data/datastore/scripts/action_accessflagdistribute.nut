function define(script)
{
    script.Name = "action_accessFlagDistribute";
    script.Type = "ActionCustom";
    return 0;
}

// Distribute a set of supplied instance character flags randomly to all
// current access players.
// - params[0]: Flag key to use for each character
// - params[1]: ZONE or INSTANCE for flag type to set
// - params[2]+: Values to distribute
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 3 || zone == null || zone.GetZoneInstance() == null ||
        (params[1] != "ZONE" && params[1] != "INSTANCE"))
    {
        return Result_t.FAIL;
    }

    local instance = zone.GetZoneInstance();
    local key = params[0].tointeger();
    local vals = [];

    // Put the values passed in to the array randomly
    while(params.len() > 2)
    {
        local idx = 2 + Randomizer.RNG(0, params.len() - 3);
        vals.append(params.remove(idx));
    }

    // Set character instance flags
    local accessCIDs = instance.GetOriginalAccessCIDsList();
    for(local i = 0; i < accessCIDs.len(); i++)
    {
        local val = vals[i % vals.len()].tointeger();
        if(params[1] == "INSTANCE")
        {
            instance.SetFlagState(key, val, accessCIDs[i]);
        }
        else
        {
            zone.SetFlagState(key, val, accessCIDs[i]);
        }
    }

    return Result_t.SUCCESS;
}