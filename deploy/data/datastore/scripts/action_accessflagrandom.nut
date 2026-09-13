function define(script)
{
    script.Name = "action_accessFlagRandom";
    script.Type = "ActionCustom";
    return 0;
}

// Randomly pick a world CID that has access to the current instance and set
// it on a zone or instance flag
// - params[0]: Flag key to store the character world CID in
// - params[1]: ZONE or INSTANCE for flag type to set
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 2 || zone == null || zone.GetZoneInstance() == null ||
        (params[1] != "ZONE" && params[1] != "INSTANCE"))
    {
        return Result_t.FAIL;
    }

    local instance = zone.GetZoneInstance();
    local key = params[0].tointeger();
    local vals = [];

    local accessCIDs = instance.GetOriginalAccessCIDsList();
    if(accessCIDs.len() == 0)
    {
        // Shouldn't happen
        return Result_t.FAIL;
    }

    local val = accessCIDs[Randomizer.RNG(0, accessCIDs.len() - 1)];
    if(params[1] == "INSTANCE")
    {
        instance.SetFlagState(key, val, 0);
    }
    else
    {
        zone.SetFlagState(key, val, 0);
    }

    return Result_t.SUCCESS;
}