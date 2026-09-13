function define(script)
{
    script.Name = "bool_digitalizeRaceDLv";
    script.Type = "EventCondition";
    return 0;
}

// Checks if a character's digitalize level for a particular demon race is greater than a provided value.
// - value1 = ID of a demon race; if -1, use current digitalize state; if 0, check params instead.
// - value2 = DLevel
// - params[0]+ = list of race IDs to check.
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character != null)
    {
        local progress = character.GetProgress().Get();
        if(value1 == -1)
        {
            local dgState = cState.GetDigitalizeState();
            if(dgState != null)
            {
                return progress.GetDigitalizeLevelsByKey(dgState.GetRaceID()) >= value2 ? 0 : -1;
            }
        }
        else if(value1 != 0)
        {
            return progress.GetDigitalizeLevelsByKey(value1) >= value2 ? 0 : -1;
        }
        else
        {
            for(local i = 0; i < params.len(); i++)
            {
                if(progress.GetDigitalizeLevelsByKey(params[i].tointeger()) >= value2)
                {
                    return 0;
                }
            }
        }
    }

    return -1;
}