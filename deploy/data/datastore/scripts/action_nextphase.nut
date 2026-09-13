function define(script)
{
    script.Name = "action_nextPhase";
    script.Type = "ActionCustom";
    return 0;
}

// Advance the match in the current zone's phase
// - params[0]: Phase to advance from if second param specified, otherwise phase to advance to
// - params[1]: Optional phase to advance to if supplied phase advancing from
function run(source, cState, dState, zone, server, params)
{
    if(zone == null)
    {
        return Result_t.FAIL;
    }

    if(params.len() == 1)
    {
        return server.GetMatchManager().AdvancePhase(zone, params[0].tointeger(), -1)
            ? Result_t.SUCCESS : Result_t.FAIL;
    }
    else if(params.len() == 2)
    {
        return server.GetMatchManager().AdvancePhase(zone, params[1].tointeger(), params[0].tointeger())
            ? Result_t.SUCCESS : Result_t.FAIL;
    }

    return Result_t.FAIL;
}