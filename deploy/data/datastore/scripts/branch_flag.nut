function define(script)
{
    script.Name = "branch_flag";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on the value stored in the specified flag
// - params[0]: Flag key to check
// - params[1]: Flag type: ZONE, INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[2]:+ Flag value to compare for each branch
function check(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 3 || zone == null ||
        (params[1] != "ZONE" && params[1] != "INSTANCE" &&
        params[1] != "CHARACTER" && params[1] != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(params[1] != "CHARACTER" && params[1] != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(params[1] == "ZONE" || params[1] == "CHARACTER")
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

    local val = flagSource.GetFlagState(params[0].tointeger(), 0, worldCID);
    for(local i = 2; i < params.len(); i++)
    {
        if(params[i].tointeger() == val)
        {
            return i - 2;
        }
    }

    return -1;
}