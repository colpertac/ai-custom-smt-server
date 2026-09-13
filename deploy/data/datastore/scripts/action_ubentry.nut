function define(script)
{
    script.Name = "action_UBEntry";
    script.Type = "ActionCustom";
    return 0;
}

// Join the Ultimate Battle queue currently awaiting entrants in a specified
// global zone. If the match is actually an Ultimate Attack, join right away.
// - params[0]: Global zone ID
// - params[1]: Global dynamic map ID
function run(source, cState, dState, zone, server, params)
{
    if(cState == null || params.len() < 2)
    {
        return Result_t.FAIL;
    }

    local gZone = server.GetZoneManager().GetGlobalZone(params[0].tointeger(),
        params[1].tointeger());

    return server.GetMatchManager().JoinUltimateBattleQueue(cState.GetWorldCID(), gZone)
        ? Result_t.SUCCESS : Result_t.FAIL;
}