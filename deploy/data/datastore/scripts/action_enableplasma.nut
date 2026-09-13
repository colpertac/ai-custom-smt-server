function define(script)
{
    script.Name = "action_enablePlasma";
    script.Type = "ActionCustom";
    return 0;
}

// Enable the supplied plasmas in the current zone
// - params[0]+: Plasma IDs (if first entry is RANDOM, pick one)
function run(source, cState, dState, zone, server, params)
{
    if(zone == null || params.len() == 0)
    {
        return Result_t.FAIL;
    }

    if(params[0] == "RANDOM")
    {
        if(params.len() < 2)
        {
            return Result_t.FAIL;
        }

        local pState = zone.GetPlasma(
            params[Randomizer.RNG(1, params.len() - 1)].tointeger());
        if(pState == null)
        {
            return Result_t.FAIL;
        }

        pState.Toggle(true, true);
    }
    else
    {
        for(local i = 0; i < params.len(); i++)
        {
            local pState = zone.GetPlasma(params[i].tointeger());
            if(pState == null)
            {
                return Result_t.FAIL;
            }

            pState.Toggle(true, true);
        }
    }

    return Result_t.SUCCESS;
}