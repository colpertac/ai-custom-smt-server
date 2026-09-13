function define(script)
{
    script.Name = "bool_random";
    script.Type = "EventCondition";
    return 0;
}

// Check if a random number is within the supplied success rate
// - value1: success rate
// - value2: fail rate
function check(source, cState, dState, zone, value1, value2, params)
{
    if(value1 < 1 || value2 < 0)
    {
        return -1;
    }

    if(Randomizer.RNG(1, value1 + value2) <= value1)
    {
        return 0;
    }
    else
    {
        return -1;
    }
}