function define(script)
{
    script.Name = "action_flagRangeSize";
    script.Type = "ActionCustom";
    return 0;
}

// Calculate the number of sequential non-zero character flag values starting
// at the specified key and store it into a second key.
// - params[0]: Starting key
// - params[1]: Destination key
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null || worldCID == 0)
    {
        return Result_t.FAIL;
    }

    local key = params[0].tointeger();

	while(zone.GetFlagState(key, 0, worldCID) != 0)
    {
        key++;
    }

    zone.SetFlagState(params[1].tointeger(), key - params[0].tointeger(),
        worldCID);

    return Result_t.SUCCESS;
}