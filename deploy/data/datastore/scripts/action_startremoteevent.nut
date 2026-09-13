function define(script)
{
    script.Name = "action_startRemoteEvent";
    script.Type = "ActionCustom";
    return 0;
}

// Start an event in one or more global zones
// - params[0]: ID of the event to start
// - params[1]+: Pairs of zone and dynamic map IDs to start the event in
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 3 || (params.len() % 2) != 1)
    {
        return Result_t.FAIL;
    }

    local failed = false;
    local instanceID = zone.GetInstanceID();

    for(local i = 1; i < (params.len() - 1);)
    {
        local targetZone = null;
        if(instanceID == 0)
        {
            targetZone = server.GetZoneManager().GetGlobalZone(params[i].tointeger(), 
                params[i + 1].tointeger());        
        }
        else
        {
            targetZone = server.GetZoneManager().GetExistingZone(params[i].tointeger(), 
                params[i + 1].tointeger(), instanceID);
        }

        if(targetZone == null || !server.GetZoneManager().StartZoneEvent(targetZone, params[0]))
        {
            failed = true;
        }

        i += 2;
    }

    return failed ? Result_t.FAIL : Result_t.SUCCESS;
}