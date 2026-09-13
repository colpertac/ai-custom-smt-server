function define(script)
{
    script.Name = "action_instancePlayerReport";
    script.Type = "ActionCustom";
    return 0;
}

// Gather information about how many players are in the current instance and
// optionally check if a specific world ID is among them.
// - params[0]: ZONE or INSTANCE for flag types to use during this script
// - params[1]: Flag key to use for increasing the count
// - params[2]: (Optional) flag key to check for matching world CID
// - params[3]: (Optional) flag key to set to world CID if param 2 matches
// - params[4]: (Optional) character flag key to set to 0 or 1 when matching
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 2 || params.len() == 3 || params.len() == 4 ||
        cState == null || zone == null || zone.GetZoneInstance() == null ||
        (params[0] != "ZONE" && params[0] != "INSTANCE"))
    {
        return Result_t.FAIL;
    }

    local instance = zone.GetZoneInstance();
    if(params[0] == "INSTANCE")
    {
        instance.SetFlagState(params[1].tointeger(),
            instance.GetFlagState(params[1].tointeger(), 0, 0) + 1, 0);
    }
    else
    {
        zone.SetFlagState(params[1].tointeger(),
            zone.GetFlagState(params[1].tointeger(), 0, 0) + 1, 0);
    }

    if(params.len() >= 5)
    {
        local worldCID = cState.GetWorldCID();
        if(params[0] == "INSTANCE")
        {
            if(instance.GetFlagState(params[2].tointeger(), 0, 0) == worldCID)
            {
                instance.SetFlagState(params[3].tointeger(), worldCID, 0);
                instance.SetFlagState(params[4].tointeger(), 1, worldCID);
            }
            else
            {
                instance.SetFlagState(params[4].tointeger(), 0, worldCID);
            }
        }
        else
        {
            if(zone.GetFlagState(params[2].tointeger(), 0, 0) == worldCID)
            {
                zone.SetFlagState(params[3].tointeger(), worldCID, 0);
                zone.SetFlagState(params[4].tointeger(), 1, worldCID);
            }
            else
            {
                zone.SetFlagState(params[4].tointeger(), 0, worldCID);
            }
        }
    }

    return Result_t.SUCCESS;
}