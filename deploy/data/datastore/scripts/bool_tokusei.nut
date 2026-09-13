function define(script)
{
    script.Name = "bool_tokusei";
    script.Type = "EventCondition";
    return 0;
}

// Check if the provided tokusei is active on a target
// - params[0]: tokusei to check
function check(source, cState, dState, zone, value1, value2, params)
{
    if(source != null)
    {
        return source.GetCalculatedState().EffectiveTokuseiKeyExists(params[0].tointeger()) ? 0 : -1;
    }
    else if(cState != null)
    {
        return cState.GetCalculatedState().EffectiveTokuseiKeyExists(params[0].tointeger()) ? 0 : -1;
    }

    return -1;
}