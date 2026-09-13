function define(script)
{
    script.Name = "action_UBStart";
    script.Type = "ActionCustom";
    return 0;
}

// Start an Ultimate Battle match
// - params[0]: Global zone ID
// - params[1]: Global dynamic map ID
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 2)
    {
        return Result_t.FAIL;
    }

    local gZone = server.GetZoneManager().GetGlobalZone(params[0].tointeger(),
        params[1].tointeger());

    return server.GetMatchManager().StartUltimateBattle(gZone)
        ? Result_t.SUCCESS : Result_t.FAIL;
}