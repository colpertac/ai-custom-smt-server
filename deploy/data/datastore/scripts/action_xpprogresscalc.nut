function define(script)
{
    script.Name = "action_xpProgressCalc";
    script.Type = "ActionCustom";
    return 0;
}

// Calculate how much XP is needed to reach a certain percentage of the way
// to the current character's next level and store the value in the specified
// zone character flag.
// - params[0]: Percentage to next level
// - params[1]: Zone character flag key to store the value in
// - params[2]: Mode
//   0) Store the required XP for the percentage
//   1) Store in flag only if the character has that much XP
function run(source, cState, dState, zone, server, params)
{
    local character = cState.GetEntity();
    if(params.len() < 2 || character == null)
    {
        return Result_t.FAIL;
    }

    local percent = params[0].tofloat();
    local key = params[1].tointeger();
    local mode = params.len() >= 3 ? params[2].tointeger() : 0;

    local lvl = character.GetCoreStats().Get().GetLevel();
    local xp = character.GetCoreStats().Get().GetXP();

    if(lvl == 99)
    {
        // Can't gain another level, set to -1
        zone.SetFlagState(key, -1, cState.GetWorldCID());

        return Result_t.SUCCESS;
    }

    local LEVEL_XP_REQUIREMENTS = [
        0,               // 0->1
        40,              // 1->2
        180,             // 2->3
        480,             // 3->4
        1100,            // 4->5
        2400,            // 5->6
        4120,            // 6->7
        6220,            // 7->8
        9850,            // 8->9
        14690,           // 9->10
        20080,           // 10->11
        25580,           // 11->12
        33180,           // 12->13
        41830,           // 13->14
        50750,           // 14->15
        63040,           // 15->16
        79130,           // 16->17
        99520,           // 17->18
        129780,          // 18->19
        159920,          // 19->20
        189800,          // 20->21
        222600,          // 21->22
        272800,          // 22->23
        354200,          // 23->24
        470400,          // 24->25
        625000,          // 25->26
        821600,          // 26->27
        1063800,         // 27->28
        1355200,         // 28->29
        1699400,         // 29->30
        840000,          // 30->31
        899000,          // 31->32
        1024000,         // 32->33
        1221000,         // 33->34
        1496000,         // 34->35
        1855000,         // 35->36
        2304000,         // 36->37
        2849000,         // 37->38
        3496000,         // 38->39
        4251000,         // 39->40
        2160000,         // 40->41
        2255000,         // 41->42
        2436000,         // 42->43
        2709000,         // 43->44
        3080000,         // 44->45
        3452000,         // 45->46
        4127000,         // 46->47
        5072000,         // 47->48
        6241000,         // 48->49
        7640000,         // 49->50
        4115000,         // 50->51
        4401000,         // 51->52
        4803000,         // 52->53
        5353000,         // 53->54
        6015000,         // 54->55
        6892000,         // 55->56
        7900000,         // 56->57
        9308000,         // 57->58
        11220000,        // 58->59
        14057000,        // 59->60
        8122000,         // 60->61
        8538000,         // 61->62
        9247000,         // 62->63
        10101000,        // 63->64
        11203000,        // 64->65
        12400000,        // 65->66
        14382000,        // 66->67
        17194000,        // 67->68
        20444000,        // 68->69
        25600000,        // 69->70
        21400314,        // 70->71
        23239696,        // 71->72
        24691100,        // 72->73
        27213000,        // 73->74
        31415926,        // 74->75
        37564000,        // 75->76
        46490000,        // 76->77
        55500000,        // 77->78
        66600000,        // 78->79
        78783200,        // 79->80
        76300000,        // 80->81
        78364000,        // 81->82
        81310000,        // 82->83
        85100000,        // 83->84
        89290000,        // 84->85
        97400000,        // 85->86
        110050000,       // 86->87
        162000000,       // 87->98
        264000000,       // 88->89
        354000000,       // 89->90
        696409989,       // 90->91
        1392819977,      // 91->92
        2089229966,      // 92->93
        2100000000,      // 93->94
        2110000000,      // 94->95
        10477689898,     // 95->96
        41910759592,     // 96->97
        125732278776,    // 97->98
        565795254492,    // 98->99
    ];

    local requiredXP = ceil(LEVEL_XP_REQUIREMENTS[lvl] * percent * 0.01);

    if(mode == 1 && requiredXP > xp)
    {
        // Character does not have enough XP
        requiredXP = 0;
    }

    zone.SetFlagState(key, requiredXP, cState.GetWorldCID());

    return Result_t.SUCCESS;
}