function define(script)
{
    script.Name = "action_disablePlasmaSequence";
    script.Type = "ActionCustom";
    return 0;
}

// Disable plasmas sequentially starting with a specified plasma 
//in the current zone
// - params[0]: Plasma IDs
// - params[1]: Number of sequential plasmas to disable.
function run(source, cState, dState, zone, server, params)
{
    if(zone != null && params.len() == 2)
    {
        local pStart = params[0].tointeger();
        local j = params[1].tointeger();
        for(local i = 0; i < j; i++)
        {
            local pState = zone.GetPlasma(pStart + i);
            if(pState == null)
            {
                continue;
            }
            pState.Toggle(false, false);
        }

        return Result_t.SUCCESS;
    }

    return Result_t.FAIL
}